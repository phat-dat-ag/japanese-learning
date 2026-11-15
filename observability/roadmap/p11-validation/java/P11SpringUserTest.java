package p11;

import com.japaneselearning.user.config.JwtDecoderConfig;
import com.japaneselearning.user.config.RsaKeyProperties;
import com.japaneselearning.user.security.JwtProperties;
import com.japaneselearning.user.security.RsaKeyProvider;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

public class P11SpringUserTest {
    @ParameterizedTest
    @ValueSource(strings = {
            "validNew", "wrongIssuer", "expired", "unknownKid",
            "wrongSignature", "learningOwnerNew", "wrongAudience"
    })
    void localConfiguredKeysAndIssuerRemainAuthoritative(String name) {
        RsaKeyProperties.Key key = new RsaKeyProperties.Key();
        key.setKid("p11-user");
        key.setPrivateKeyPath(P11Cases.value("user.private.path"));
        key.setPublicKeyPath(P11Cases.value("user.public.path"));
        key.setActive(true);
        RsaKeyProperties keys = new RsaKeyProperties();
        keys.setKeys(List.of(key));
        RsaKeyProvider provider = new RsaKeyProvider(keys, Map.of());
        provider.loadKeys();

        JwtProperties properties = new JwtProperties("japaneselearning-user-service", 900, 30);
        JwtDecoder decoder = new JwtDecoderConfig().jwtDecoder(provider, properties);
        String token = P11Cases.value("spring." + name + ".token");
        boolean accepted = name.equals("validNew") || name.equals("wrongAudience");

        if (accepted) {
            assertDoesNotThrow(() -> decoder.decode(token));
        } else {
            assertThrows(JwtException.class, () -> decoder.decode(token));
        }
    }
}
