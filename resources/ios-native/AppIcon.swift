// --- Shalter: иконка приложения (дописано scripts/apply-native-resources.js) ---
// Плагин AppIcon: Capacitor.Plugins.AppIcon.set({ name: "gold" }) ставит альтернативную
// иконку AppIcon-gold из Assets.xcassets, "classic" — основную. iOS сама показывает
// окно «Вы изменили значок» — так устроена система, убрать его нельзя.
@objc(AppIconPlugin)
public class AppIconPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppIconPlugin"
    public let jsName = "AppIcon"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise)
    ]

    @objc func set(_ call: CAPPluginCall) {
        let name = call.getString("name") ?? "classic"
        let iconName: String? = name == "classic" ? nil : "AppIcon-\(name)"
        DispatchQueue.main.async {
            guard UIApplication.shared.supportsAlternateIcons else {
                call.reject("Смена иконки на этом устройстве не поддерживается")
                return
            }
            if UIApplication.shared.alternateIconName == iconName {
                call.resolve(["name": name])
                return
            }
            UIApplication.shared.setAlternateIconName(iconName) { error in
                if let error = error {
                    call.reject(error.localizedDescription)
                } else {
                    call.resolve(["name": name])
                }
            }
        }
    }
}

// Контроллер из Main.storyboard: тот же CAPBridgeViewController, плюс свои плагины.
class ShalterBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(AppIconPlugin())
    }
}
