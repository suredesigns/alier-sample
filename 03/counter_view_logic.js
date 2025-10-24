import { ViewLogic } from "/alier_sys/ViewLogic.js";
class CounterView extends ViewLogic {
    constructor() {
        super();
        this.relateElements( this.collectElements( this.loadContainer({ text: `
            <alier-container>
              <alier-button id="counter"></alier-button>
            </alier-container>
        ` })));

        Alier.Model.onChange.addListener(msg => this.post(msg));
        Alier.Model.reset();
    }

    async messageHandler(msg) {
        return await msg.deliver({
            counter  : msg => Alier.Model.countUp(),
            onChange : msg => this.counter.textContent = `count: ${msg.param.count}`
        });
    }
}

export { CounterView };
