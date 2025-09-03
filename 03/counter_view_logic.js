import { ViewLogic } from "/alier_sys/ViewLogic.js";
class CounterView extends ViewLogic {
    constructor() {
        super();
        this.relateElements( this.collectElements( this.loadContainer({ text: `
            <alier-container>
              <input type="button" id="counter" data-ui-component data-active-events="click" />
            </alier-container>
        ` })));

        Alier.Model.onChange.addListener(msg => this.post(msg));
        Alier.Model.reset();
    }

    async messageHandler(msg) {
        return await msg.deliver({
            counter  : msg => Alier.Model.countUp(),
            onChange : msg => this.counter.value = `count: ${msg.param.count}`
        });
    }
}

export { CounterView };
