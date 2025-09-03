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

const model_module = {};
const xml_parser = new DOMParser();
import { LazyNew } from "/alier_sys/LazyNew.js";
import { ObservableObject } from "/alier_sys/ObservableObject.js";
import { ObservableArray } from "/alier_sys/ObservableArray.js";
import { WebApi } from "/alier_sys/WebApi.js";
import { AgentRepository } from "/alier_sys/Auth.js";

/**
 * Builds a model interface from the given XML document.
 * 
 * As a result, `Alier.Model` is replaced with the model interface
 * newly created.
 * 
 * This function is recursive and each parameters is used for two
 * purposes. one for the initial call and another for recursive calls.
 * 
 * @param {Element} element
 * A root element of the XML.
 * 
 * In recursive calls, the node currently in focus is given as
 * this parameter.
 * 
 * @param {object?} position
 * This parameter is used only in recursive calls.
 *  
 * In recursive calls, a part of the model interface associated with 
 * the focused node of the given XML document is given as
 * this parameter.
 * 
 * @param {string?} class_name
 * This parameter is used only in recursive calls.
 *  
 * In recursive calls, a string representing the model class name is
 * given as this parameter.
 * The class name is used for retrieving the model properties.
 */
function _setInterface(element, position, class_name) {
    //  NOTE:
    //  This function is recursive and the given parameters are
    //  intentionally modified during the process.
    switch (element.tagName.toLowerCase()) {
        case "interface": {
            globalThis.Alier.Model = {};
            if (element.className) {
                const model_class = new model_module[element.className]();
                if (model_class instanceof AlierModel) {
                    class_name = element.className;
                }
            }
            position = Alier.Model;
            for (const child of element.children) {
                _setInterface(child, position, class_name);
            }
            break;
        }
        case "unit": {
            const name = element.attributes.getNamedItem("name").value;
            position[name] = {};
            if (element.className) {
                const model_class = new model_module[element.className]();
                if (model_class instanceof AlierModel) {
                    class_name = element.className;
                }
            }
            position = position[name];
            for (const child of element.children) {
                _setInterface(child, position, class_name);
            }
            break;
        }
        case "function": {
            if (element.className) {
                const model_class = new model_module[element.className]();
                if (model_class instanceof AlierModel) {
                    class_name = element.className;
                }
            }
            const attributes = element.attributes;
            const locale = attributes.getNamedItem("locale")?.value ?? "local";
            if (locale === "local") {
                if (class_name) {
                    const model_class = new model_module[class_name]();
                    const path = attributes.getNamedItem("path").value;
                    const name = attributes.getNamedItem("name").value;
                    const func = model_class[path];
                    if (typeof func === "function") {
                        position[name] = func.bind(model_class);
                    }
                }
            } else if (locale === "native") {
                const path = attributes.getNamedItem("path").value;
                const name = attributes.getNamedItem("name").value;
                position[name] = (...args) => {
                    return Alier.Native[path](args);
                };
            }
            break;
        }
        case "message-porter": {
            if (element.className) {
                const model_class = new model_module[element.className]();
                if (model_class instanceof AlierModel) {
                    class_name = element.className;
                }
            }
            if (class_name) {
                const model_class = new model_module[class_name]();
                const attributes = element.attributes;
                const locale = attributes.getNamedItem("locale")?.value ?? "local";
                if (locale === "local") {
                    const path = attributes.getNamedItem("path").value;
                    const name = attributes.getNamedItem("name").value;

                    const event_handler = model_class[path];
                    if (event_handler instanceof MessagePorter) {
                        position[name] = {
                            addListener   : event_handler.addListener.bind(event_handler),
                            deleteListener: event_handler.deleteListener.bind(event_handler),
                            post          : attributes.getNamedItem("postEnable") ?
                                event_handler.post.bind(event_handler) :
                                () => {}
                        };
                    }
                } else if (locale === "native") {
                    //native
                }
            }
            break;
        }
        case "observable-object": {
            if (element.className) {
                const model_class = new model_module[element.className]();
                if (model_class instanceof AlierModel) {
                    class_name = element.className;
                }
            }
            if (class_name) {
                const model_class = new model_module[class_name]();
                const attributes = element.attributes;
                const locale = attributes.getNamedItem("locale")?.value ?? "local";
                if (locale === "local") {
                    const path = attributes.getNamedItem("path").value;
                    const name = attributes.getNamedItem("name").value;
                    const observable_obj = model_class[path];
                    if (observable_obj instanceof ObservableObject) {
                        position[name] = {
                            bindData: observable_obj.bindData.bind(observable_obj)
                        };
                    }
                }
            }
            break;
        }
        case "observable-array": {
            if (element.className) {
                const model_class = new model_module[element.className]();
                if (model_class instanceof AlierModel) {
                    class_name = element.className;
                }
            }
            if (class_name) {
                const model_class = new model_module[class_name]();
                const attributes = element.attributes;
                const locale = attributes.getNamedItem("locale")?.value ?? "local";
                if (locale === "local") {
                    const path = attributes.getNamedItem("path").value;
                    const name = attributes.getNamedItem("name").value;
                    const observable_arr = model_class[path];
                    if (observable_arr instanceof ObservableArray) {
                        position[name] = {
                            bindData: observable_arr.bindData.bind(observable_arr)
                        };
                    }
                }
            }
            break;
        }
        case "restful-object": {
            if (element.className) {
                const model_class = new model_module[element.className]();
                if (model_class instanceof AlierModel) {
                    class_name = element.className;
                }
            }
            const attributes = element.attributes;
            const locale = attributes.getNamedItem("locale")?.value ?? "local";
            if (locale === "local") {
                if (class_name) {
                    const model_class = new model_module[class_name]();
                    const path = attributes.getNamedItem("path").value;
                    const name = attributes.getNamedItem("name").value;
                    position[name] = new RestfulObject(model_class[path]);
                }
            } else if (locale === "remote") {
                const name = attributes.getNamedItem("name").value;
                const auth = attributes.getNamedItem("auth")?.value;
                const uri = new URL(attributes.getNamedItem("uri").value, document.URL);

                position[name] = LazyNew(WebApi, ctor => {
                    position[name] = new ctor({
                        host: uri.origin,
                        path: uri.pathname,
                        authAgent: AgentRepository.pickAgent(auth)
                    });
                    return position[name];
                });
            }
            break;
        }
        default: {
            for (const child of element.children) {
                _setInterface(child, position, class_name);
            }
            break;
        }
    }
}

/**
 * Sets up the model interface object defined in the given XML text.
 * 
 * This function initializes `Alier.Model`.
 * 
 * @param {string | Promise<string>} xmlText
 * A string or a `Promise` that resolves to a string representing
 * the XML document that defines the model interface to be set up.
 * 
 * @returns {Promise<void>}
 * A Promise settled when the setup is completed.
 */
async function setupModelInterfaceFromText(xmlText) {
    if (xmlText instanceof Promise) {
        return xmlText.then(setupModelInterfaceFromText);
    }

    const doc = xml_parser.parseFromString(xmlText, "application/xml");

    const import_tags = doc.getElementsByTagName("import");
    const imported_modules = [];
    for (const import_tag of import_tags) {
        const path = import_tag.attributes.getNamedItem("path").value;
        const canonical_path = new URL(path, document.baseURI).pathname;
        imported_modules.push(import(canonical_path));
    }
    Object.assign(model_module, ...await Promise.all(imported_modules));

    const model_interface = doc.getElementsByTagName("interface");
    _setInterface(model_interface[0], null, null);
}

/**
 * Sets up the model interface object defined in the given XML file.
 * 
 * This function initializes `Alier.Model`.
 * 
 * @param {object} xmlObj
 * @param {string} xmlObj.xml
 * A string representing the XML file path that defines
 * the model interface to be set up.
 * 
 * @returns {Promise<void>}
 * A Promise settled when the setup is completed.
 */
async function setupModelInterface(xmlObj) {
    /** @type {string} */
    const xml = await Alier.Sys.loadText(xmlObj.xml);
    await setupModelInterfaceFromText(xml);
}

/**
 * A class of `<restful-object>` interface objects.
 * 
 * The instances represent objects conforming to the REST interface.
 */
class RestfulObject {
    /**
     * Creates a wrapper object for the given REST object.
     * 
     * @param {object} restObj 
     * an object that conforms to the REST interface.
     */
    constructor(restObj) {
        const method_names = ["get", "post", "put", "delete"];
        for (const method_name of method_names) {
            const method = restObj[method_name];
            this[method_name] = (typeof method === "function") ?
                method.bind(restObj) :
                () => {}
            ;
        }
    }
}

export { setupModelInterfaceFromText, setupModelInterface };
