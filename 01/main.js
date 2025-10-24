import * as AlierFramework from "/alier_sys/AlierFramework.js";
Object.assign(globalThis, AlierFramework);

export default async function main() {
    setupAlier();
    AlierView.setStyleSheets(true, "/alier_sys/ColorTheme_Nihonkai.css", "/alier_sys/AlierGlassy.css");

    Alier.View.attach(new Hello());
}

class Hello extends ViewLogic {
    constructor() {
        super();

        // container
        const container = `
          <alier-container>
            <alier-button id="button">ボタン</alier-button>
            <alier-text id="comment"></alier-text>
          </alier-container>
        `;

        // load html
        this.relateElements(
            this.collectElements(
                this.loadContainer({ text: container })
            )
        );
    }

    async messageHandler(msg) {
        return await msg.deliver({
            button: msg => {
                // commentにhello alierを挿入する
                this.comment.value = "Hello, alier!";
            }
        });
    }
}
