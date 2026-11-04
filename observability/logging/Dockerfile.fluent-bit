FROM nginx:stable-alpine@sha256:73c75df4075c918f91017fdda46ad81e55e5af77ba3a64ca3d5014bd9244fe7f AS state
RUN mkdir -p /state/buffer && chown -R 185:185 /state

FROM cr.fluentbit.io/fluent/fluent-bit:4.2.5@sha256:76d5a62479523c2ad54142ee2d93b1fd44fa06b96eae483fbf2e5f1f67a870fc
COPY --from=state --chown=185:185 /state /state
COPY fluent-bit.conf parsers-app.conf normalize.lua /fluent-bit/etc/
USER 185:185
ENTRYPOINT ["/fluent-bit/bin/fluent-bit", "-c", "/fluent-bit/etc/fluent-bit.conf"]
