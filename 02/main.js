
Object.assign(globalThis, await Alier.import("/alier_sys/AlierFramework.js"));
Object.assign(globalThis, await Alier.import("my_view_logic.js"));

async function main() {
    setupAlier();

    Alier.View.attach(new SwitchView());
}

