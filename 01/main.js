Object.assign(globalThis, await Alier.import("/alier_sys/AlierFramework.js"));

async function main() {
    setupAlier();

    Alier.View.attach(new Hello());
}

class Hello extends ViewLogic {
    constructor() {
        super();

        // container
        const container = `
          <alier-container>
            <input type="button" id="button" value="ボタン" data-ui-component data-active-events="click"/>
            <div id="comment" data-ui-component></div>
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
                this.comment.innerText = "Hello, alier!"
            }
        });
    }
}
