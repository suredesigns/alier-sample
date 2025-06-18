Object.assign(globalThis, await Alier.import("/alier_sys/AlierFramework.js"));
Object.assign(globalThis, await Alier.import("counter_view_logic.js"));

async function main() {
    setupAlier();
    await setupModelInterface({ xml: "counter_model.xml" });
    Alier.View.attach(new CounterView());
}
