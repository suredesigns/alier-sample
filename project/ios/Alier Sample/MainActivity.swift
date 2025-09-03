import Foundation
import alier
import WebKit

//Needs to be defined as a struct.
struct MainActivity: MainActivityDelegate{
    func webViewConfig(context: Context, webView: WKWebView) {
        //This code is required to inspect the WebView for Safari.
        if #available(iOS 16.4, *) {
            webView.isInspectable = true
        }
    }
}
