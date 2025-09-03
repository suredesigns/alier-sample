import { AlierModel } from "/alier_sys/AlierModel.js";
class CounterModel extends AlierModel {
    #count = 0;
    onChange = new MessagePorter();
    constructor() {
        super()
        return this.initialize();
    }

    countUp() {
        this.setCount(this.#count + 1);
    }

    reset() {
        this.setCount(0);
    }

    setCount(num) {
        this.#count = num;
        this.onChange.post(Alier.message("onChange", "", { count: this.#count }));
    }
}

export { CounterModel };