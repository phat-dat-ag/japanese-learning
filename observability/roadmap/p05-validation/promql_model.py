"""Independent, deliberately LIMITED float-vector PromQL reference interpreter.

Parses the actual candidate expressions. NOT Prometheus/promtool, no native histograms,
subqueries, bool modifiers, group_left/right, regex dialect parity or engine equivalence.
Rejects unsupported syntax rather than pretending to validate arbitrary PromQL.
"""
from dataclasses import dataclass
import json
import math
import operator
import re

TOKEN = re.compile(r'\s*("(?:\\.|[^"\\])*"|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?[smhd]?|[A-Za-z_:][A-Za-z0-9_:]*|=~|!~|>=|<=|==|!=|[{}()\[\],=+*/<>-])')
PRECEDENCE = {'or':1, 'and':2, 'unless':2, '>':3, '<':3, '>=':3, '<=':3,
              '==':3, '!=':3, '+':4, '-':4, '*':5, '/':5}
COMPARE = {'>':operator.gt, '<':operator.lt, '>=':operator.ge, '<=':operator.le,
           '==':operator.eq, '!=':operator.ne}
ARITHMETIC = {'+':operator.add, '-':operator.sub, '*':operator.mul}


def seconds(value):
    match = re.fullmatch(r'(\d+)([smhd])', value)
    if not match:
        raise ValueError('Unsupported duration: '+value)
    return int(match[1])*{'s':1,'m':60,'h':3600,'d':86400}[match[2]]


def key(labels):
    return tuple(sorted(labels.items()))


@dataclass
class Sample:
    value: float
    timestamp: float


class Parser:
    def __init__(self, source):
        self.source = source
        self.tokens = []
        offset = 0
        while offset < len(source):
            match = TOKEN.match(source, offset)
            if not match:
                raise ValueError('Unsupported token at '+source[offset:])
            self.tokens.append(match[1])
            offset = match.end()
        self.index = 0

    def peek(self):
        return self.tokens[self.index] if self.index < len(self.tokens) else None

    def take(self, expected=None):
        value = self.peek()
        if value is None or expected is not None and value != expected:
            raise ValueError('Expected '+str(expected)+', got '+str(value))
        self.index += 1
        return value

    def parse(self):
        result = self.expression()
        if self.peek() is not None:
            raise ValueError('Unconsumed syntax: '+str(self.tokens[self.index:]))
        return result

    def labels(self):
        self.take('(')
        result = []
        while self.peek() != ')':
            result.append(self.take())
            if self.peek() != ',':
                break
            self.take(',')
        self.take(')')
        return result

    def expression(self, minimum=0):
        left = self.primary()
        while self.peek() in PRECEDENCE and PRECEDENCE[self.peek()] >= minimum:
            operation = self.take()
            matching = None
            if self.peek() == 'on':
                self.take('on')
                matching = self.labels()
            right = self.expression(PRECEDENCE[operation]+1)
            left = ('binary', operation, left, right, matching)
        return left

    def primary(self):
        token = self.take()
        if token == '(':
            result = self.expression()
            self.take(')')
            return result
        if re.fullmatch(r'\d+(?:\.\d+)?(?:[eE][+-]?\d+)?',token):
            return ('scalar', float(token))
        if token in ('sum','max','min','count') and self.peek() == 'by':
            self.take('by')
            labels = self.labels()
            self.take('(')
            child = self.expression()
            self.take(')')
            return ('aggregate', token, labels, child)
        if self.peek() == '(':
            if token not in ('rate','increase','absent','timestamp','time','count_over_time'):
                raise ValueError('Unsupported function: '+token)
            self.take('(')
            child = None if self.peek() == ')' else self.expression()
            self.take(')')
            return ('function', token, child)
        matchers = []
        if self.peek() == '{':
            self.take('{')
            while self.peek() != '}':
                label = self.take()
                operation = self.take()
                if operation not in ('=','!=','=~','!~'):
                    raise ValueError('Invalid label matcher')
                value = json.loads(self.take())
                matchers.append((label, operation, value))
                if self.peek() != ',':
                    break
                self.take(',')
            self.take('}')
        window = None
        if self.peek() == '[':
            self.take('[')
            window = seconds(self.take())
            self.take(']')
        return ('selector', token, matchers, window)


def selectors(ast):
    if ast[0] == 'selector':
        yield ast
    elif ast[0] == 'binary':
        yield from selectors(ast[2])
        yield from selectors(ast[3])
    elif ast[0] == 'aggregate':
        yield from selectors(ast[3])
    elif ast[0] == 'function' and ast[2] is not None:
        yield from selectors(ast[2])


def matches(labels, matchers):
    for label, operation, expected in matchers:
        value = labels.get(label, '')
        equal = value == expected if operation in ('=','!=') else re.fullmatch(expected,value) is not None
        if equal != (operation in ('=','=~')):
            return False
    return True


class Evaluator:
    def __init__(self, series):
        self.series = series
        self.recordings = {}

    def evaluate(self, ast, at):
        kind = ast[0]
        if kind == 'scalar':
            return ast[1]
        if kind == 'selector':
            _, name, matchers, window = ast
            if name in self.recordings:
                if window is not None:
                    raise ValueError('Recorded range vectors not implemented')
                return {labels:value for labels,value in self.recordings[name].items()
                        if matches(dict(labels),matchers)}
            output = {}
            for series in self.series:
                if series['metric'] != name or not matches(series['labels'],matchers):
                    continue
                points = [(stamp,value) for stamp,value in series['points'] if stamp <= at and value is not None]
                labels = key(series['labels'])
                if window is not None:
                    output[labels] = [(stamp,value) for stamp,value in points if at-window < stamp <= at and value != 'stale']
                elif points and points[-1][0] >= at-300 and points[-1][1] != 'stale':
                    output[labels] = Sample(float(points[-1][1]),points[-1][0])
            return output
        if kind == 'aggregate':
            _, operation, names, child = ast
            groups = {}
            for labels, sample in self.evaluate(child,at).items():
                group = key({name:value for name,value in labels if name in names})
                groups.setdefault(group,[]).append(sample.value)
            functions = {'sum':sum, 'max':max, 'min':min, 'count':len}
            return {labels:Sample(float(functions[operation](values)),at) for labels,values in groups.items()}
        if kind == 'function':
            _, function, child = ast
            if function == 'time':
                return float(at)
            values = self.evaluate(child,at)
            if function == 'timestamp':
                return {labels:Sample(sample.timestamp,at) for labels,sample in values.items()}
            if function == 'absent':
                if values:
                    return {}
                labels = {name:value for name,operation,value in child[2] if operation == '='}
                return {key(labels):Sample(1,at)}
            if child[0] != 'selector' or child[3] is None:
                raise ValueError('Range function requires raw range selector')
            result = {}
            for labels, points in values.items():
                if function == 'count_over_time':
                    if points:
                        result[labels] = Sample(len(points),at)
                elif len(points) >= 2:
                    value = self.extrapolate(points,at,child[3],function == 'rate')
                    result[labels] = Sample(value,at)
            return result
        if kind == 'binary':
            _, operation, left, right, matching = ast
            first, second = self.evaluate(left,at), self.evaluate(right,at)
            if isinstance(first,(int,float)) and isinstance(second,(int,float)):
                return self.calculate(operation,first,second)
            if isinstance(first,(int,float)) or isinstance(second,(int,float)):
                reverse = isinstance(first,(int,float))
                scalar, vector = (first,second) if reverse else (second,first)
                result = {}
                for labels,sample in vector.items():
                    a,b = (scalar,sample.value) if reverse else (sample.value,scalar)
                    if operation in COMPARE:
                        if COMPARE[operation](a,b):
                            result[labels] = sample
                    else:
                        result[labels] = Sample(self.calculate(operation,a,b),at)
                return result
            def signature(labels):
                return labels if matching is None else key({k:v for k,v in labels if k in matching})
            lookup = {signature(labels):(labels,sample) for labels,sample in second.items()}
            result = {}
            for labels,sample in first.items():
                other = lookup.get(signature(labels))
                if operation == 'unless':
                    if other is None:
                        result[labels] = sample
                elif operation in ('and','or'):
                    if other is not None or operation == 'or':
                        result[labels] = sample
                elif other is not None:
                    if operation in COMPARE:
                        if COMPARE[operation](sample.value,other[1].value):
                            result[labels] = sample
                    else:
                        result[labels] = Sample(self.calculate(operation,sample.value,other[1].value),at)
            if operation == 'or':
                occupied = {signature(labels) for labels in first}
                result.update({labels:sample for labels,sample in second.items() if signature(labels) not in occupied})
            return result
        raise ValueError('Unsupported AST: '+str(ast))

    @staticmethod
    def calculate(operation, first, second):
        if operation == '/':
            if second == 0:
                return math.nan if first == 0 else math.copysign(math.inf,first)
            return first/second
        if operation not in ARITHMETIC:
            raise ValueError('Unsupported scalar operation: '+operation)
        return ARITHMETIC[operation](first,second)

    @staticmethod
    def extrapolate(points, at, window, is_rate):
        first_time, first = points[0]
        last_time, last = points[-1]
        interval = last_time-first_time
        delta = last-first
        for (_,previous),(_,current) in zip(points,points[1:]):
            if current < previous:
                delta += previous
        average = interval/(len(points)-1)
        start, end = first_time-(at-window), at-last_time
        if start >= average*1.1:
            start = average/2
        if end >= average*1.1:
            end = average/2
        if delta > 0 and first >= 0:
            start = min(start, interval*first/delta)
        value = delta*(interval+start+end)/interval
        return value/window if is_rate else value


def render(text, labels):
    return text.replace('{{ $labels.job }}',labels.get('job',''))


class RuleModel:
    def __init__(self, rules, series):
        self.rules = [(rule,Parser(rule['expr']).parse()) for group in rules['groups'] for rule in group['rules']]
        self.engine = Evaluator(series)
        self.state = {}

    def step(self, at):
        self.engine.recordings = {}
        firing = []
        for rule, ast in self.rules:
            values = self.engine.evaluate(ast,at)
            if 'record' in rule:
                self.engine.recordings[rule['record']] = values
                continue
            present = set()
            for labels in values:
                rendered = dict(labels)
                rendered.update({name:render(value,dict(labels)) for name,value in rule['labels'].items()})
                identity = (rule['alert'],key(rendered))
                present.add(identity)
                state = self.state.setdefault(identity,{'since':at,'firing':False,'clear':None})
                state['clear'] = None
                if at-state['since'] >= seconds(rule['for']):
                    state['firing'] = True
                if state['firing']:
                    firing.append({'name':rule['alert'],'labels':rendered,'annotations':rule['annotations']})
            for identity in list(self.state):
                if identity[0] != rule['alert'] or identity in present:
                    continue
                state = self.state[identity]
                hold = seconds(rule.get('keep_firing_for','0s'))
                if state['firing'] and hold:
                    if state['clear'] is None:
                        state['clear'] = at
                    if at-state['clear'] < hold:
                        firing.append({'name':rule['alert'],'labels':dict(identity[1]),'annotations':rule['annotations']})
                        continue
                del self.state[identity]
        return firing
