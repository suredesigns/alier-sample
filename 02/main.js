import * as AlierFramework from "/alier_sys/AlierFramework.js";
import * as MyViewLogic from "./my_view_logic.js";
Object.assign(globalThis, AlierFramework);
Object.assign(globalThis, MyViewLogic);

export default async function main() {
    setupAlier();

    Alier.View.attach(new SwitchView());
}