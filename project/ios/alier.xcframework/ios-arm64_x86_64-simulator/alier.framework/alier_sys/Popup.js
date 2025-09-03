/*
Copyright 2024 Suredesigns Corp.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { Envelope } from "/alier_sys/Envelope.js";

class PopupContainer extends ViewLogic {}
class PopupFrame extends ViewLogic {
    attachPopup() {}
}

/**
 * Validate that the given element has "alier-view" elements.
 * @param {Element} element - container element
 * @returns {Element}
 * @throws {Error}
 */
function validate_alier_view(element) {
    if (element.getElementsByTagName("alier-view").length === 0) {
        throw new Error(
            `The container must contain elements named "alier-view"`
        );
    }
    return element;
}

class ModalFrame extends PopupFrame {
    envelope = new Envelope();
    /**
     * @inheritdoc
     * @throws {Error}
     * when the loaded container doesn't have "alier-view" elements.
     * @see {@link ViewLogic.loadContainer}
     */
    loadContainer(params) {
        const loaded = super.loadContainer(params);
        return loaded instanceof Promise
            ? loaded.then((contents) => validate_alier_view(contents))
            : validate_alier_view(loaded);
    }
    async messageHandler(msg){
        msg.deliver({
            close:(msg) => {
                Popup.close(this);
                this.envelope.post(msg.param);
            },
            modalOverlay:() => {
                this.modal.container.post(this.message("cancel", null, null));
            }
        });
    }
    attachPopup(vl) {
        let elements = this.container.getElementsByTagName("alier-view");
        if(elements.length == 1){
            elements[0].attach(vl);
        }
        else if(elements.length > 1){
            if(elements.namedItem("popupContainer")) {
                elements.namedItem("popupContainer").attach(vl);
            }
        }
    }
}
class ModelessFrame extends PopupFrame {
    /**
     * @inheritdoc
     * @throws {Error}
     * when the loaded container doesn't have "alier-view" elements.
     * @see {@link ViewLogic.loadContainer}
     */
    loadContainer(params) {
        const loaded = super.loadContainer(params);
        return loaded instanceof Promise
            ? loaded.then((contents) => validate_alier_view(contents))
            : validate_alier_view(loaded);
    }
    async messageHandler(msg){
        msg.deliver({
            close:(msg) => {
                Popup.close(this);
            }
        });
    }
    attachPopup(vl) {
        let elements = this.container.getElementsByTagName("alier-view");
        if(elements.length == 1){
            elements[0].attach(vl);
        }
        else if(elements.length > 1){
            if(elements.namedItem("popupContainer")) {
                elements.namedItem("popupContainer").attach(vl);
            }
        }
    }
}
class MessageboxFrame extends PopupFrame {
    envelope = new Envelope();
    async messageHandler(msg){
        msg.deliver({
            close:(msg) => {
                Popup.close(this);
                this.envelope.post(msg.param);
            },
            modalOverlay:() => {
                this.modal.container.post(this.message("cancel", null, null));
            }
        });
    }
    attachPopup(param){
        if(typeof param == "string"){
            this.reflectValues({popupText:param});
        }
        this.post(this.message("attachPopup", null, param));
    }
}
class ToastFrame extends PopupFrame {
    async messageHandler(msg){
        msg.deliver({
            close:(msg) => {
                Popup.close(this);
            }
        });
    }
    attachPopup(param){
        if(typeof param == "string"){
            this.reflectValues({popupText:param});
        }
        this.post(this.message("attachPopup", null, param));
    }
}

class DefaultModalPopup extends ModalFrame {
    constructor(){
        super();
        this.loadContainer({ text: defModal_xml, id: "modal-overlay" });
        this.relateElements(this.collectElements(this.container));
    }
}
class DefaultModelessPopup extends ModelessFrame {
    constructor(){
        super();
        this.loadContainer({ text: defModeless_xml, id: "modeless" });
        this.relateElements(this.collectElements(this.container));
    }
}
class DefaultMessagebox extends MessageboxFrame {
    constructor(){
        super();
        this.loadContainer({ text: messagebox_xml, id: "messagebox-overlay" });
        this.relateElements(this.collectElements(this.container));
    }
    handlerMap = {
        close:(msg) => {
            Popup.close(this);
            this.envelope.post(msg.param);
        },
        modalOverlay:() => {
            this.post(this.message("cancel", null, null));
        },
        cancel:() => {
            this.close();
        }
    }
    async messageHandler(msg){
        msg.deliver(this.handlerMap);
    }
    attachPopup(param){
        let text = {popupText:param};
        if (typeof param === "object"){
            text.popupText = param.message;
        }
        if(typeof text.popupText !== "string"){
            throw new TypeError(`${text.popupText} is not a string`);
        }
        let buttons = new Set(param.button);
        if(buttons.size === 0){
            buttons.add("ok");
        }
        for (let button of buttons){
            if (typeof button !== "string"){
                throw new TypeError(`${button} is not a string`);
            }
            let but = document.createElement("button");
            but.setAttribute("id", button);
            but.innerText = button;
            but.setAttribute("data-ui-component", "");
            but.setAttribute("data-active-events", "click");
            this.buttons.appendChild(but);
            this.handlerMap[button] = () => { this.close(button) };
        }
        this.reflectValues(text);
        this.relateElements(this.collectElements(this.container));
        this.post(this.message("attachPopup", null, param));
    }
}
class DefaultToast extends ToastFrame {
    constructor(seconds){
        super();
        this.loadContainer({ text: toast_xml, id: "toast" });
        this.relateElements(this.collectElements(this.container));
        this.seconds = typeof seconds == "number" ? seconds : 1;
    }
    async messageHandler(msg){
        msg.deliver({
            close:(msg) => {
                Popup.close(this);
            },
            vl$attached:() => {
                setTimeout(() => {this.post(this.message("close", null, null))}, this.seconds * 1000);
            }
        });
    }
}

const android_xml = {
    defModal_xml : `<div id="modal-overlay" class="modal-overlay" data-ui-component data-active-events="click">
    <style>
        .closed {
            display: none;
        }

        .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 50;
            background: rgba(0, 0, 0, 0.6);
            display: flex;
            align-items: center;
            justify-content: space-around;
        }

        .modal {
            width: fit-content;
            height: fit-content;
            position: fixed;
        }
    </style>
    <alier-view id="modal" class="modal" data-ui-component data-active-events="click">

    </alier-view>
</div>`,

    defModeless_xml : `<div id="modeless" class="modeless">
    <alier-view data-ui-component data-active-events="click">
        <style>
            .closed {
                display: none;
            }

            .modeless {
                border: solid black;
                width: fit-content;
                height: fit-content;
                position: fixed;
            }
        </style>
    </alier-view>
</div>`,

    messagebox_xml : `<div id="messagebox-overlay" class="messagebox-overlay" data-ui-component data-active-events="click">
    <style>
        .closed {
            display: none;
        }

        .messagebox-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 50;
            background: rgba(0, 0, 0, 0.6);
            display: flex;
            align-items: center;
            justify-content: space-around;
        }

        .box {
            background-color: rgb(255, 255, 255);
            width: fit-content;
            height: fit-content;
            position: fixed;
            margin: auto;
            text-align: center;
        }

        .buttons {
            margin: 0 auto;
            display: flex;
            justify-content: space-around;
        }

        button {
            flex: 1;
            margin: 5%;
        }
    </style>
    <div id="okTemplate" class="box">
        <div class="">
            <div id="popuptext" data-ui-component>
                <p id="popupText" data-ui-component data-primary="innerText"></p>
            </div>
            <div id="buttons" class="buttons" data-ui-component>
            </div>
        </div>
    </div>
</div>`,

    toast_xml : `<div id="toast" class="toast" data-ui-component data-active-events="click">
    <style>
        .closed {
            display: none;
        }

        .toast {
            border: solid black;
            width: fit-content;
            height: fit-content;
            position: fixed;
        }
    </style>
    <div id="okTemplate" class="box">
        <div class="">
            <div id="popuptext" data-ui-component>
                <p id="popupText" data-ui-component data-primary="innerText"></p>
            </div>
        </div>
    </div>
</div>`
};

const ios_xml = {
    defModal_xml : `<div id="modal-overlay" class="modal-overlay" data-ui-component data-active-events="click">
    <style>
        .closed {
            display: none;
        }

        .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 50;
            background: rgba(0, 0, 0, 0);
            display: flex;
            align-items: center;
            justify-content: space-around;
        }

        .modal {
            background: rgba(255, 255, 255, 0.8);
            border-radius: 20px;
            width: fit-content;
            height: fit-content;
            position: fixed;
        }
    </style>
    <alier-view id="modal" class="modal" data-ui-component data-active-events="click">

    </alier-view>
</div>`,

    defModeless_xml : `<div id="modeless" class="modeless">
    <alier-view data-ui-component data-active-events="click">
        <style>
            .closed {
                display: none;
            }

            .modeless {
                background: rgba(255, 255, 255, 0.8);
                border-radius: 20px;
                width: fit-content;
                height: fit-content;
                position: fixed;
            }
        </style>
    </alier-view>
</div>`,

    messagebox_xml : `<div id="messagebox-overlay" class="messagebox-overlay" data-ui-component
    data-active-events="click">
    <style>
        .closed {
            display: none;
        }

        .messagebox-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 50;
            background: rgba(0, 0, 0, 0);
            display: flex;
            align-items: center;
            justify-content: space-around;
        }

        .box {
            background: rgba(255, 255, 255, 0.8);
            border-radius: 20px;
            width: fit-content;
            height: fit-content;
            position: fixed;
            margin: auto;
            text-align: center;
        }

        .buttons {
            margin: 0 auto;
            display: flex;
            justify-content: space-around;
        }

        button {
            flex: 1;
            margin: 5%;
        }
    </style>
    <div id="okTemplate" class="box">
        <div class="">
            <div id="popuptext" data-ui-component>
                <p id="popupText" data-ui-component data-primary="innerText"></p>
            </div>
            <div id="buttons" class="buttons" data-ui-component>
            </div>
        </div>
    </div>
</div>`,

    toast_xml : `<div id="toast" class="toast" data-ui-component data-active-events="click">
    <style>
        .closed {
            display: none;
        }

        .toast {
            background: rgba(255, 255, 255, 0.8);
            border-radius: 20px;
            width: fit-content;
            height: fit-content;
            position: fixed;
        }
    </style>
    <div id="okTemplate" class="box">
        <div class="">
            <div id="popuptext" data-ui-component>
                <p id="popupText" data-ui-component data-primary="innerText"></p>
            </div>
        </div>
    </div>
</div>`
};

const popup_xml = Alier.getEnv("OS_NAME") == "iOS" ? ios_xml : Alier.getEnv("OS_NAME") == "Android" ? android_xml : {} ;
const { defModal_xml, defModeless_xml, messagebox_xml, toast_xml } = popup_xml;

class Popup{

    static #popupMap = new Map();

    static get #ModalId() {return 0};
    static get #ModelessId() {return 1};
    static get #MessageboxId() {return 2};
    static get #ToastId() {return 3};

    static {
        Popup.#popupMap.set(Popup.#ModalId, DefaultModalPopup);
        Popup.#popupMap.set(Popup.#ModelessId, DefaultModelessPopup);
        Popup.#popupMap.set(Popup.#MessageboxId, DefaultMessagebox);
        Popup.#popupMap.set(Popup.#ToastId, DefaultToast);
    }

    static #attachFrame(frame){
        let element = document.createElement("alier-view");
        document.body.appendChild(element);
        element.attach(frame);
    }
    static #detachFrame(frame){
        document.body.removeChild(frame.host);
        frame.host.detach(frame);
    }

    static #setDefaultFrame(id, frameClass){
        if (!(new frameClass() instanceof PopupFrame)){
            throw new TypeError(`${frameClass} is not an instance of PopupFrame`);
        }
        let oldFrame = Popup.#popupMap.get(id);
        Popup.#popupMap.set(id, frameClass);
        return oldFrame;
    }
    static setDefaultModalPopupFrame(frameClass){
        if (!(new frameClass() instanceof ModalFrame)){
            throw new TypeError(`${frameClass} is not an instance of ModalFrame`);
        }
        return Popup.#setDefaultFrame(Popup.#ModalId, frameClass);
    }
    static setDefaultModelessPopupFrame(frameClass){
        if (!(new frameClass() instanceof ModelessFrame)){
            throw new TypeError(`${frameClass} is not an instance of ModelessFrame`);
        }
        return Popup.#setDefaultFrame(Popup.#ModelessId, frameClass);
    }
    static setDefaultMessageboxFrame(frameClass){
        if (!(new frameClass() instanceof MessageboxFrame)){
            throw new TypeError(`${frameClass} is not an instance of MessageboxFrame`);
        }
        return Popup.#setDefaultFrame(Popup.#MessageboxId, frameClass);
    }
    static setDefaultToastFrame(frameClass){
        if (!(new frameClass() instanceof ToastFrame)){
            throw new TypeError(`${frameClass} is not an instance of ToastFrame`);
        }
        return Popup.#setDefaultFrame(Popup.#ToastId, frameClass);
    }

    static openModal(vl){
        if (!(vl instanceof PopupContainer)){
            throw new TypeError(`${vl} is not an instance of PopupContainer`);
        }
        let frameClass = Popup.#popupMap.get(Popup.#ModalId);
        let frame = new frameClass();
        Popup.#attachFrame(frame);
        frame.attachPopup(vl);
        vl.close = (param=null) => {
            frame.post(vl.message("close", null, param));
        }
        frame.relateViewLogics({vl});
        return frame.envelope;
    }
    static newModeless(vl){
        if (!(vl instanceof PopupContainer)){
            throw new TypeError(`${vl} is not an instance of PopupContainer`);
        }
        let frameClass = Popup.#popupMap.get(Popup.#ModelessId);
        let frame = new frameClass();
        Popup.#attachFrame(frame);
        frame.attachPopup(vl);
        vl.close = (param=null) => {
            frame.post(vl.message("close", null, param));
        }
        frame.relateViewLogics({vl});
        return frame.host;
    }
    static messagebox(contents){
        let frameClass = Popup.#popupMap.get(Popup.#MessageboxId);
        let frame = new frameClass();
        Popup.#attachFrame(frame);
        frame.attachPopup(contents);
        frame.close = (param=null) => {
            frame.post(frame.message("close", null, param));
        }
        return frame.envelope;
    }
    static toast(contents, seconds){
        let frameClass = Popup.#popupMap.get(Popup.#ToastId);
        let frame = new frameClass(seconds);
        Popup.#attachFrame(frame);
        frame.attachPopup(contents);
        frame.close = (param=null) => {
            frame.post(frame.message("close", null, param));
        }
        return frame.host;
    }

    static close(frame){
        Popup.#detachFrame(frame);
    }

    static registerCustomFrame(id, frameClass){
        if (typeof id != "string"){
            throw new TypeError(`${id} is not a string`);
        }
        if (!(new frameClass() instanceof PopupFrame)){
            throw new TypeError(`${id} is not an instance of PopupFrame`);
        }

        let oldFrame = Popup.#popupMap.get(id);
        Popup.#popupMap.set(id, frameClass);
        return oldFrame;
    }
    static openCustom(id, contents){
        if (!(Popup.#popupMap.has(id))){
            throw new ReferenceError(`${id} is an unregistered id`);
        }
        let frameClass = Popup.#popupMap.get(id);
        let frame = new frameClass();
        Popup.#attachFrame(frame);
        frame.attachPopup(contents);
        let envelope;
        for (const key in frame) {
            if(frame[key] instanceof Envelope) {
                envelope = frame[key];
                break;
            }
        }
        if(envelope) {
            if(contents instanceof PopupContainer) {
                contents.close = (param=null) => {
                     frame.post(contents.message("close", null, param));
                }
            }else {
                frame.close = (param=null) => {
                     frame.post(frame.message("close", null, param));
                }
            }
            return frame.envelope;
        }else{
            return frame.host;
        }
    }

}

export { Popup, PopupFrame, PopupContainer, ModalFrame, ModelessFrame, MessageboxFrame, ToastFrame };