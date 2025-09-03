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

/**
 * @class
 * 
 * Base class for all custom HTML elements provided by the Alier framework.
 * 
 * This class is a derivative of {@link HTMLElement}.
 * So any restrictions or behavioural properties can be applied this class.
 * 
 * As with `HTMLElement`, direct invocation of the constructor is not allowed.
 * To create an instance, you should register a constructor in 
 * {@link https://developer.mozilla.org/docs/Web/API/CustomElementRegistry/define | CustomElementRegistry}
 * before instantiation and instantiate via an appropriate DOM API such as 
 * {@link https://developer.mozilla.org/docs/Web/API/Document/createElement | document.createElement}.
 */
class AlierCustomElement extends HTMLElement {
    /**
     * A string representing an object's class name.
     * 
     * This function is invoked via `Object.prototype.toString()`.
     */
    get [Symbol.toStringTag]() { return this.constructor.name; }
}

export { AlierCustomElement };
