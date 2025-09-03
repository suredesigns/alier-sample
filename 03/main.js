import * as AlierFramework from "/alier_sys/AlierFramework.js";
import * as CounterViewLogic from "./counter_view_logic.js";
Object.assign(globalThis, AlierFramework);
Object.assign(globalThis, CounterViewLogic);

export default async function main() {
    setupAlier();
    await setupModelInterface({ xml: "counter_model.xml" });
    Alier.View.attach(new CounterView());
}
