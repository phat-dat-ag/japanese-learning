package p11;

import com.japaneselearning.learning.LearningApiApplication;
import com.japaneselearning.learning.client.JwksServiceClient;
import com.japaneselearning.learning.config.JwtSecurityProperties;
import com.japaneselearning.learning.config.ServiceEndpointProperties;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.MockMvcPrint;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(classes = LearningApiApplication.class, properties = {
        "spring.autoconfigure.exclude="
                + "org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration,"
                + "org.springframework.boot.hibernate.autoconfigure.HibernateJpaAutoConfiguration,"
                + "org.springframework.boot.data.jpa.autoconfigure."
                + "DataJpaRepositoriesAutoConfiguration"
})
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
public class P11SpringConsumerContractTest {
    private static final String FIXTURE = System.getenv("P11_CLOSURE_FIXTURE_URL");
    private static final HttpClient HTTP = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();

    @Autowired
    MockMvc mvc;

    @Autowired
    JwksServiceClient client;

    @Autowired
    JwtSecurityProperties jwt;

    @Autowired
    ServiceEndpointProperties services;

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        String base = read("publisher");
        registry.add("services.jwks.base-url", () -> base);
        registry.add("services.jwks.get-public-keys", () -> "/api/v1/jwks/user");
        registry.add("app.security.jwt.jwk-set-uri", () -> base + "/api/v1/jwks/user");
    }

    @Test
    void bothConfiguredClientsUseOnlyTheUserOwnerPartition() {
        assertEquals("/api/v1/jwks/user", services.getJwks().getPublicKeys());
        assertEquals(
                services.getJwks().baseUrl() + services.getJwks().getPublicKeys(),
                jwt.jwkSetUri()
        );
        var keys = client.getPublicKeys().keys();
        assertEquals(1, keys.size());
        assertEquals("p11-user", keys.get(0).kid());
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "validUser", "validAdmin", "malformed", "wrongSignature", "unknownKid",
            "wrongIssuer", "expired", "missingRole", "unsupportedRole", "missingExpiration",
            "missingIssuedAt", "missingKid", "futureNotBefore", "futureIssuedAt",
            "wrongAlgorithm", "learningOwner", "audienceBoundary", "missingSubject"
    })
    void realPublisherAndUnchangedSecurityChainEnforceTheirContract(String name) throws Exception {
        int expected = Integer.parseInt(read("status/" + name));
        var result = mvc.perform(get("/api/v1/learning/me")
                .header("Authorization", "Bearer " + read("token/" + name)))
                .andExpect(status().is(expected));

        if (expected == 200) {
            String role = name.equals("validAdmin") ? "ROLE_ADMIN" : "ROLE_USER";
            String other = name.equals("validAdmin") ? "ROLE_USER" : "ROLE_ADMIN";
            result.andExpect(jsonPath("$.data.authorities").value(hasItem(role)))
                    .andExpect(jsonPath("$.data.authorities").value(not(hasItem(other))))
                    .andExpect(jsonPath("$.data.issuer").value("japaneselearning-user-service"));
        }
    }

    private static String read(String suffix) {
        try {
            URI uri = URI.create(FIXTURE + "/" + suffix);
            assertTrue(uri.getHost().equals("127.0.0.1"));
            HttpRequest request = HttpRequest.newBuilder(uri)
                    .timeout(Duration.ofSeconds(5))
                    .build();
            HttpResponse<String> response = HTTP.send(
                    request,
                    HttpResponse.BodyHandlers.ofString()
            );
            assertEquals(200, response.statusCode());
            return response.body();
        } catch (Exception exception) {
            throw new IllegalStateException("Synthetic fixture unavailable", exception);
        }
    }
}
