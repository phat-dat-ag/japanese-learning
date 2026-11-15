using JapaneseLearning.User.Api.Authentication;
using JapaneseLearning.User.Domain.Users;
using JapaneseLearning.User.Infrastructure;
using JapaneseLearning.User.Infrastructure.Configuration;
using JapaneseLearning.User.Infrastructure.Security;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Moq;

namespace JapaneseLearning.User.UnitTests.Security;

public sealed class P11RealProducerTests
{
    [Theory]
    [InlineData("valid", true)]
    [InlineData("expired", false)]
    [InlineData("wrongIssuer", false)]
    [InlineData("wrongAudience", false)]
    [InlineData("unknownKid", false)]
    [InlineData("wrongSignature", false)]
    [InlineData("learningOwner", false)]
    [InlineData("malformed", false)]
    public async Task RealOwnerScopedProducerControlsAuthentication(string scenario, bool expected)
    {
        var file = Environment.GetEnvironmentVariable("P11_CASES")!;
        var values = File.ReadAllLines(file)
            .Where(line => line.Contains('='))
            .Select(line => line.Split('=', 2))
            .ToDictionary(parts => parts[0], parts => parts[1]);
        var options = new JwtOptions
        {
            SigningKeys = [new JwtSigningKeyOptions
            {
                PrivateKeyPath = values["user.private.path"], Kid = "p11-user", Active = true
            }],
            JwksUrl = values["new.user.url"],
            RequireHttpsMetadata = false,
            Issuer = "JapaneseLearning.User",
            Audience = "JapaneseLearning",
            AccessTokenExpirationMinutes = 15,
            RefreshTokenExpirationDays = 7
        };
        var keys = new JwtRsaKeys(Options.Create(options),
            Mock.Of<IHostEnvironment>(environment => environment.ContentRootPath == Path.GetDirectoryName(file)));
        await keys.StartAsync(CancellationToken.None);
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Jwt:SigningKeys:0:PrivateKeyPath"] = values["user.private.path"],
            ["Jwt:SigningKeys:0:Kid"] = "p11-user",
            ["Jwt:SigningKeys:0:Active"] = "true",
            ["Jwt:JwksUrl"] = options.JwksUrl,
            ["Jwt:RequireHttpsMetadata"] = "false",
            ["Jwt:Issuer"] = options.Issuer,
            ["Jwt:Audience"] = options.Audience,
            ["Jwt:AccessTokenExpirationMinutes"] = "15",
            ["Jwt:RefreshTokenExpirationDays"] = "7"
        }).Build();
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddInfrastructure(configuration);
        services.AddSingleton(keys);
        services.AddJwtAuthentication();
        services.AddAuthorization();
        using var provider = services.BuildServiceProvider();
        using var scope = provider.CreateScope();
        var token = values["jp." + scenario + ".token"];
        if (scenario == "valid")
        {
            var issuer = new TokenService(Options.Create(options), keys);
            token = issuer.CreateTokens(Guid.NewGuid(), "p11-fixture", "p11@example.invalid", UserRole.User).AccessToken;
            await File.WriteAllTextAsync(Path.Combine(Path.GetDirectoryName(file)!, "dotnet-issued.token"), token);
        }
        var context = new DefaultHttpContext { RequestServices = scope.ServiceProvider };
        context.Request.Headers.Authorization = "Bearer " + token;
        var result = await context.AuthenticateAsync();

        Assert.Equal(expected, result.Succeeded);
    }
}
