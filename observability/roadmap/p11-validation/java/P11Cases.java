package p11;

import java.io.IOException;
import java.io.Reader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Properties;

public final class P11Cases {
    private static final Properties VALUES = load();

    private P11Cases() {
    }

    public static String value(String name) {
        String value = VALUES.getProperty(name);
        if (value == null) {
            throw new IllegalStateException("Missing synthetic fixture field: " + name);
        }
        return value;
    }

    private static Properties load() {
        Path file = Path.of(System.getenv("P11_CASES"));
        Properties values = new Properties();
        try (Reader reader = Files.newBufferedReader(file)) {
            values.load(reader);
            return values;
        } catch (IOException exception) {
            throw new IllegalStateException("Cannot read private synthetic fixture", exception);
        }
    }
}
