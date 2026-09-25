package cn.huihui.support;

public final class AndroidRoutesTest {
    private static int checks;
    private static void check(boolean actual, boolean expected, String url) {
        checks++;
        if (actual != expected) throw new AssertionError("Unexpected permission for " + url);
    }
    public static void main(String[] args) {
        String[] navigation = {
            "https://www.ryh6666.xyz/huihui/",
            "https://www.ryh6666.xyz:443/huihui/?from=app#/pages/index/index",
            "https://WWW.RYH6666.XYZ/huihui/pages/index/index"
        };
        for (String url : navigation) check(AndroidRoutes.navigationAllowed(url), true, url);
        String[] rejected = {
            null, "", "https://www.ryh6666.xyz.evil.test/huihui/",
            "https://www.ryh6666.xyz@evil.test/huihui/",
            "https://evil.test@www.ryh6666.xyz/huihui/",
            "https://www.ryh6666.xyz:8443/huihui/", "http://www.ryh6666.xyz/huihui/",
            "file:///huihui/index.html", "javascript:alert(1)", "intent://www.ryh6666.xyz/huihui/",
            "https://ryh6666.xyz/huihui/", "https://www.ryh6666.xyz./huihui/",
            "https://www.ryh6666.xyz\\@evil.test/huihui/", "//www.ryh6666.xyz/huihui/"
        };
        for (String url : rejected) {
            check(AndroidRoutes.resourceAllowed(url), false, url);
            check(AndroidRoutes.navigationAllowed(url), false, url);
        }
        String[] resourceOnly = {
            "https://www.ryh6666.xyz/api/session",
            "https://www.ryh6666.xyz/api/staff/threads?after=1",
            "https://www.ryh6666.xyz/assets/font.woff2",
            "https://www.ryh6666.xyz/huihui-evil/", "https://www.ryh6666.xyz/"
        };
        for (String url : resourceOnly) {
            check(AndroidRoutes.resourceAllowed(url), true, url);
            check(AndroidRoutes.navigationAllowed(url), false, url);
        }
        for (String suffix : new String[]{"../", "%2e%2e/", "%2E./", "foo/../../", "%252e%252e/", "%5c../"}) {
            String url = "https://www.ryh6666.xyz/huihui/" + suffix;
            check(AndroidRoutes.navigationAllowed(url), false, url);
        }
        System.out.println("Android URL policy: " + checks + " checks passed");
    }
}
