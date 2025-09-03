import { ViewLogic } from "/alier_sys/ViewLogic.js";
class SwitchView extends ViewLogic {
    sub_backup;

    constructor() {
        super();

        this.relateElements(
            this.collectElements(
                this.loadContainerSync({ file: "first.html", id: "main_container" })
            )
        );

        this.sub_view.attach(new SubView("This is A"));
        this.sub_backup = new SubView("This is B");
    }

    async messageHandler(msg) {
        return await msg.deliver({
            forward: msg => {
                Alier.View.attach(new SecondView());
            },

            switch: msg => {
                this.sub_backup = this.sub_view.attach(this.sub_backup);
            }
        });
    }
}

class SecondView extends ViewLogic {
    constructor() {
        super();

        this.relateElements(
            this.collectElements(
                this.loadContainerSync({ file: "second.html" })
            )
        );
    }

    async messageHandler(msg) {
        return await msg.deliver({
            back: msg => {
                Alier.View.attach(new SwitchView());
            }
        });
    }
}

class SubView extends ViewLogic {
    constructor(text) {
        super();

        this.relateElements(
            this.collectElements(
                this.loadContainerSync({ file: "first.html", id: "sub_container" })
            )
        );

        this.text.value = text;
    }
}

export { SwitchView };