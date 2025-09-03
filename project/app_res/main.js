Object.assign(globalThis, await import("/alier_sys/AlierFramework.js"));

export default async function main() {
    setupAlier();
    //To display 'ViewLogic' in the view, call function 'Alier.View.attach' to attach it.
}
