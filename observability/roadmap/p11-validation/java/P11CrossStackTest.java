package p11;

import com.japaneselearning.security.JwtSecurityTestProfile;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.TestProfile;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.Map;

import static io.restassured.RestAssured.given;
import static org.junit.jupiter.api.Assertions.assertEquals;

@QuarkusTest
@TestProfile(P11CrossStackTest.Profile.class)
public class P11CrossStackTest {
    @ConfigProperty(name = "quarkus.oidc.jwks-path")
    String actualJwksUrl;

    @ParameterizedTest
    @ValueSource(strings = {
            "valid", "expired", "wrongIssuer", "wrongAudience",
            "unknownKid", "wrongSignature", "learningOwner", "malformed"
    })
    void sharedSyntheticTokenUsesRealOwnerScopedProducer(String name) {
        assertEquals(P11Cases.value("new.user.url"), actualJwksUrl);
        int expected = Integer.parseInt(P11Cases.value("jp." + name + ".status"));

        given()
                .auth().oauth2(P11Cases.value("jp." + name + ".token"))
                .get("/api/v1/jlpt-levels")
                .then().statusCode(expected);
    }

    public static class Profile extends JwtSecurityTestProfile {
        @Override
        public Map<String, String> getConfigOverrides() {
            return Map.of(
                    "quarkus.oidc.jwks-path", P11Cases.value("new.user.url"),
                    "quarkus.oidc.auth-server-url", P11Cases.value("new.base.url"),
                    "quarkus.oidc.token.issuer", "JapaneseLearning.User",
                    "quarkus.oidc.token.audience", "JapaneseLearning"
            );
        }
    }
}
