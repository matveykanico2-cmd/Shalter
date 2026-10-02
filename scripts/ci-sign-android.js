const fs = require("fs");
const path = require("path");

const gradlePath = path.join(__dirname, "..", "android", "app", "build.gradle");
let content = fs.readFileSync(gradlePath, "utf8");

const signingConfigsBlock = `android {
    signingConfigs {
        release {
            def props = new Properties()
            file("../keystore.properties").withInputStream { props.load(it) }
            storeFile file("../" + props["storeFile"])
            storePassword props["storePassword"]
            keyAlias props["keyAlias"]
            keyPassword props["keyPassword"]
        }
    }`;

if (!content.includes("android {\n    signingConfigs {")) {
  if (!content.includes("android {")) throw new Error("build.gradle: couldn't find 'android {' to patch — Capacitor's generated template must have changed shape");
  content = content.replace("android {", signingConfigsBlock);
}

const releaseAnchor = "release {\n            minifyEnabled false";
if (!content.includes("signingConfig signingConfigs.release")) {
  if (!content.includes(releaseAnchor)) throw new Error("build.gradle: couldn't find the release buildType block to patch — Capacitor's generated template must have changed shape");
  content = content.replace(releaseAnchor, "release {\n            signingConfig signingConfigs.release\n            minifyEnabled false");
}

fs.writeFileSync(gradlePath, content);
console.log("android/app/build.gradle patched with release signingConfig.");
