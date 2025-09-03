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

import { AlierCustomElement } from "/alier_sys/AlierCustomElement.js";
import { ViewLogic } from "/alier_sys/ViewLogic.js";

class AlierView extends AlierCustomElement {

    /**
     * Attaches the target {@link ViewLogic} to this AlierView.
     *
     * @param {ViewLogic} containerToBeAttached
     * A ViewLogic to be attached
     * 
     * @returns
     * detached ViewLogic if it was previously attached, `null` otherwise.
     * 
     * @throws {TypeError} 
     * -  when the given object is not a ViewLogic
     * @see 
     * - {@link AlierView.prototype.detach}
     * - {@link AlierView.prototype.show}
     * - {@link ViewLogic.attachTo}
     */
    attach(containerToBeAttached) {
        const vl = containerToBeAttached;

        if (!(vl instanceof ViewLogic)) {
            throw new TypeError(`${vl} is not a ${ViewLogic.name}`);
        } else if (vl.host === this) {
            return null;
        }
        
        const detached_container = this.detach();

        this.#container = vl;
        ViewLogic.attachTo(vl, this);

        const attached_container = this.#container;
        this.#shadowRoot.append(attached_container.styles, attached_container.container);

        this.show();

        return detached_container;
    }
    
    /**
     * Detaches the attached {@link ViewLogic} from this AlierView.
     *
     * @returns
     * detached ViewLogic if it was attached, `null` otherwise.
     * 
     * @see
     * - {@link AlierView.prototype.attach}
     * - {@link AlierView.prototype.hide}
     * - {@link ViewLogic.detachFrom}
     */
    detach() {
        const detached_container = this.#container;
        if (detached_container == null) {
            return null;
        }

        this.#container = null;

        ViewLogic.detachFrom(detached_container, this);

        return detached_container;
    }
    
    /**
     * Shows the contents currently attached.
     *
     * This function do nothing if there is no contents attached or the contents is already visible.
     *
     * @see
     * - {@link AlierView.prototype.attach}
     * - {@link AlierView.prototype.show}
     */
    show() {
        const contents = this.#container?.container;
        if (contents == null || contents.style.visibility === "visible") {
            return;
        }

        contents.style.visibility = "visible";
    }
    
    /**
     * Hides the contents currently attached.
     *
     * This function do nothing if there is no contents attached or the contents is already hidden.
     *
     * @see
     * - {@link AlierView.prototype.attach}
     * - {@link AlierView.prototype.show}
     */
    hide() {
        const contents = this.#container?.container;
        if (contents == null || contents.style.visibility === "hidden") {
            return;
        }

        contents.style.visibility = "hidden";
    }

    /**
     * Post a message to the ViewLogic attached to this AlierView.
     *
     * @param {Object} msg
     * @param {string?} msg.id
     * The primary identifier of the message.
     *
     * @param {string?} msg.code
     * The secondary identifier of the message.
     *
     * @param {any?} msg.param
     * An optional parameter object of the message.
     *
     * @param {ProtoViewLogic} msg.origin
     * The original sender of the message.
     *
     * @returns {Promise<boolean>}
     * A Promise enveloping a boolean which indicates whether or not the posted message has been consumed.
     *
     * @see
     * - {@link ProtoViewLogic.post}
     */
    post(msg) {
        if (this.#container != null) {
            return this.#container.post(msg);
        }
    }
    
    /**
     * `ViewLogic` attached to this `AlierView`.
     * 
     * @type {ViewLogic | null}
     * @see
     * - {@link AlierView.prototype.attach}
     */
    get container() {
        return this.#container;
    }

    /**
     * @constructor
     */
    constructor() {
        super();
        this.#shadowRoot = this.attachShadow({ mode: "closed" });
    }

    connectedCallback(){
        this.style.display = "block";
    }

    /**
     * @type {ShadowRoot}
     */
    #shadowRoot;
    
    /**
     * @type {ViewLogic | null}
     */
    #container = null;
}

export { AlierView };
