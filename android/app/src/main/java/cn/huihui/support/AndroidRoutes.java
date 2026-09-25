package cn.huihui.support;

import java.net.URI;
import java.net.URISyntaxException;

public final class AndroidRoutes {
    public static final String HOME = "https://www.ryh6666.xyz/huihui/";

    public static boolean resourceAllowed(String url) {
        if (url == null) return false;
        try {
            URI uri = new URI(url);
            return "https".equalsIgnoreCase(uri.getScheme())
                && "www.ryh6666.xyz".equalsIgnoreCase(uri.getHost())
                && uri.getRawUserInfo() == null
                && (uri.getPort() == -1 || uri.getPort() == 443);
        } catch (URISyntaxException e) {
            return false;
        }
    }

    public static boolean navigationAllowed(String url) {
        if (!resourceAllowed(url)) return false;
        try {
            URI uri = new URI(url);
            String path = uri.getPath();
            // Reject ambiguous encodings and traversal before checking the UI boundary.
            if (path == null || path.indexOf('\\') >= 0 || path.indexOf('%') >= 0) return false;
            for (String segment : path.split("/")) {
                if (segment.equals(".") || segment.equals("..")) return false;
            }
            return path.startsWith("/huihui/");
        } catch (URISyntaxException e) {
            return false;
        }
    }
}
