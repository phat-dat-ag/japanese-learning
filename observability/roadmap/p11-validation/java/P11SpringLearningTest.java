package p11;

import com.japaneselearning.learning.config.JwtDecoderConfig;
import com.japaneselearning.learning.config.JwtSecurityProperties;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;

import java.time.Duration;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

public class P11SpringLearningTest {
    @ParameterizedTest
    @ValueSource(strings = {
            "validNew", "validOld", "wrongIssuer", "expired", "unknownKid",
            "wrongSignature", "learningOwnerNew", "learningOwnerOld", "wrongAudience"
    })
    void realProducerContractsUseUnmodifiedConsumerDecoder(String name) {
        String prefix = "spring." + name;
        JwtSecurityProperties properties = new JwtSecurityProperties(
                P11Cases.value(prefix + ".url"),
                "japaneselearning-user-service",
                Duration.ofSeconds(60)
        );
        JwtDecoder decoder = new JwtDecoderConfig().jwtDecoder(properties);
        String token = P11Cases.value(prefix + ".token");

        if (Boolean.parseBoolean(P11Cases.value(prefix + ".accepted"))) {
            assertDoesNotThrow(() -> decoder.decode(token));
        } else {
            assertThrows(JwtException.class, () -> decoder.decode(token));
        }
    }
}
