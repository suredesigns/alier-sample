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

import { ProtoViewLogic } from "/alier_sys/ProtoViewLogic.js";

/**
 * @class
 *
 * A derivative of {@link ProtoViewLogic} class which has a container storing a group of HTML elements.
 * 
 */
class ViewLogic extends ProtoViewLogic {
    /**
     * A group of HTML contents.
     */
    get container() { return this.#container; }
    
    /**
     * A {@link AlierView} hosting this `ViewLogic` instance.
     * 
     * `this.host` changes to `null` when the host has detached this ViewLogic.
     * 
     * `this.host` changes to some `AlierView` when that `AlierView` has attached this ViewLogic.
     * 
     * By default, this value is `null`.
     * 
     * @see
     * - {@link AlierView.prototype.attach}
     * - {@link AlierView.prototype.detach}
     */
    get host() { return this.#host; }
    
    /**
     * A &lt;div&gt; element containing &lt;style&gt; elements as its children.
     * Any CSS rules in this &lt;div&gt; is applied to the DOM tree under the host `AlierView`.
     * 
     * &lt;style&gt; elements are moved from its original document when contents are loaded to the container.
     * 
     * @returns {HTMLDivElement}
     */
    get styles() { return this.#styles; }

    /**
     * @override
     * Posts the given message to the target ViewLogic.
     * 
     * If the target ViewLogic does not consume the given
     * message, then reposts the message to the owner of the target
     * ViewLogic's host.
     * This will be done if and only if the host and its owner exist.
     * 
     * This method overrides the {@link ProtoViewLogic.prototype.post} method.
     * 
     * @param {({ id?: string, code?: string, param?: any, origin?: any })} message 
     * @returns {Promise<boolean>} `true` if the message is consumed,
     * `false` otherwise.
     */
    async post(message) {
        const result = super.post(message);
        if (this.parent != null || this.#host == null) {
            return result;
        }

        const consumed = await result;
        if (consumed) {
            return consumed;
        }

        const host = this.#host;
        if (this.parent != null || host == null) {
            return consumed;
        }

        const { owner } = ProtoViewLogic.getRelationshipOf(host);
        return (
            !(owner instanceof ProtoViewLogic) ||
            owner === this ||
            owner.getAncestors().has(this)
        ) ? 
            consumed :
            owner.post({
                id      : message.id,
                code    : message.code,
                origin  : message.origin,
                param   : message.param,
                repostBy: host,
                last    : {
                    //  message.target is set by ProtoViewLogic's post(),
                    //  hence message.target is null if this override
                    //  is directly invoked.
                    target: message.target ?? this,
                    last: message.last,
                    repostBy: message.repostBy
                }
            })
        ;
    }

    /**
     * Stores a group of HTML contents to the container.
     * 
     * @param {Element | Promise<Element>} newContainer 
     * contents replacing the existing one.
     * 
     * If a Promise is passed, replace the existing contents with the enveloped contents when the Promise is settled.
     * If already some Promise was given and it is not settled yet,
     * the contents enveloped in the preceding Promise are discarded.
     * 
     * If the given contents contain &lt;style&gt;s or &lt;link rel="stylesheet"&gt;s,
     * then they are collected and then update styles implicitly.
     * 
     * Before replacing the contents, the given contents are upgraded
     * by using {@link CustomElementRegistry.prototype.upgrade}.
     * 
     * When the contents are replaced, a message with id `"vl$containerUpdated"` is posted from the target ViewLogic.
     * This message has the following parameters as properties of the message's `param` property:
     * 
     * -  oldStyles   :  an Element including the replaced style definitions
     * -  oldContainer:  an Element including the replaced contents
     * 
     * @returns {Element | null | Promise<Element | null>}
     * the old contents if the contents exist, otherwise `null`.
     * Where "old contents" means the contents previously stored in the target `ViewLogic`'s `container` property.
     * 
     * If the `newContainer` is a `Promise`, this function returns a Promise enveloping the old contents or `null` instead.
     * 
     * @throws {TypeError}
     * -  when the given contents is not an Element.
     * 
     * @throws {Error}
     * -  when the given contents violates the existing DOM hierarchy (caused by `DOMException`).
     * 
     * @see
     * - {@link CustomElementRegistry.prototype.upgrade}
     * 
     */
    setContainer(newContainer) {
        const old_container      = this.#container;
        const deferred_container = this.#deferred_container;
        const new_container      = newContainer;

        if (old_container === new_container) {
            return null;
        } else if (new_container instanceof Promise) {
            if (deferred_container === new_container) {
                return null;
            }

            this.#deferred_container = new_container;
            return new_container.then(container => {
                // Deferred contents was already replaced another contents or deferred contents.
                if (this.#deferred_container !== new_container) { return null; }

                //  Erase reference to the resolved contents.
                this.#deferred_container = null;

                return this.setContainer(container);
            });
        } else if (!(new_container instanceof Element)) {
            throw new TypeError(`${new_container} is not an Element`);
        }

        //  Erase reference to a deferred contents.
        this.#deferred_container = null;
        new_container.remove();

        this.#addInternalLinkEquivalents(new_container);

        const new_styles   = ViewLogic.#captureStyles(new_container);
        const old_styles   = this.#styles;

        customElements.upgrade(new_container);

        try {
            this.#styles.replaceWith(new_styles);
        } catch (e) {
            this.#deferred_container = deferred_container;
            throw new Error(
                `The given contents cannot replace the existing contents (reason: ${e.message})`,
                { cause: e }
            );
        }

        try {
            this.#container.replaceWith(new_container);
        } catch (e) {
            new_styles.replaceWith(old_styles);
            this.#deferred_container = deferred_container;
            throw new Error(
                `The given contents cannot replace the existing contents (reason: ${e.message})`,
                { cause: e }
            );
        }

        this.#styles    = new_styles;
        this.#container = new_container;

        this.post(this.message("vl$containerUpdated", null, {
            oldStyles   : old_styles,
            oldContainer: old_container,
        }));

        return old_container;
    }
    
    /**
     * Stores contents fetched from the given file path or url, or parsed from text to the target `ViewLogic`'s {@link container}.
     *
     * NOTE: The given property determines whether the method will be synchronous or asynchronous.
     *
     * @param {object} params
     * Parameters to load a container.
     * It MUST contain at least one of the following propertie: text, file or url.
     * If multiple properties are passed, load in order of priority: text, file, url.
     *
     * @param {string?} params.text
     * A string that has HTML document with container.
     *
     * @param {string?} params.file
     * File path to HTML document with container.
     *
     * @param {string|URL?} params.url
     * URL to retrive HTML document with container.
     *
     * @param {string?} params.id
     * The `id` attribute of the target container.
     * If not, detect the first `<alier-container>` element as the target container.
     * {@link parseHtmlToContainer}
     *
     * @returns {Element|Promise<Element>}
     * A contents newly stored to the target `ViewLogic`'s container.
     * If load from text, return an Element.
     * If load from file or url, return a Promise that resolves with an Element.
     * 
     * @throws {TypeError}
     * - when none of the following properties are included in params: text, file or url.
     * - when the given params.text is not a string.
     * - when the given params.file is not a string.
     * - when the given params.url is neither a URL nor a string starting with "http:" or "https:".
     * - when the given params.url is a string starting with "http:" or "https:" but it is not convertible to a URL.
     * - when the given params.id is neither a string nor null.
     * 
     * @throws {ReferenceError}
     * - when the loaded contents from the given target does not contain an element with the given id.
     * - when the loaded contents from the given target does not contain an element named "alier-container".
     */
    loadContainer(params) {
        const { text, file, url, id: container_id} = params;

        if (text == null && file == null && url == null) {
            throw new TypeError(
                "MUST contain at least one of the following properties: text, file or url"
            );
        }

        const load_container_from_text = (loaded_text) => {
            let loaded_container;
            try {
                loaded_container = ViewLogic.parseHtmlToContainer(loaded_text, container_id);
            } catch (e) {
                let message;
                if (container_id != null) {
                    // load priority: text, file, url
                    const target = text != null ? "the given text"
                        : file != null ? file
                        : url.toString();
                    message = `element with id "${container_id}" does not exist in "${target}"`;
                } else {
                    message = "couldn't find the <alier-container> element.";
                }
                throw new ReferenceError(message, { cause: e });
            }

            this.setContainer(loaded_container);

            return this.#container;
        }

        // load from text
        if (text != null) {
            if (typeof text !== "string") {
                throw new TypeError("The text property must be a string");
            }

            return load_container_from_text(text);
        }

        // load from file
        if (file != null) {
            if (typeof file !== "string") {
                throw new TypeError("The file property must be a string");
            }

            ///  FOR NATIVE APP ---
            return Alier.Native.loadText(file)
                .then((loaded_text) => load_container_from_text(loaded_text));
            ///  --- FOR NATIVE APP
        }

        // load text fetched from url
        /**
         * @type {URL}
         */
        let _url;
        if (url instanceof URL) {
            _url = url;
        } else if (typeof url === "string" && /^https?:/i.test(url)) {
            try {
                _url = new URL(url);
            } catch (e) {
                throw new TypeError(
                    `The url property is not a valid URL (reason: ${e.message})`,
                    { cause: e }
                );
            }
        } else {
            throw new TypeError(
                "The url property must be a URL or a string starting with http(s):"
            );
        }

        ///  FOR NATIVE APP ---
        return Alier.fetch(_url)
            .then((response) => response.text())
            .then((loaded_text) => load_container_from_text(loaded_text));
        ///  --- FOR NATIVE APP
    }

    /**
     * Stores contents fetched from the given file path or parsed from the text to the target `ViewLogic`'s {@link container}.
     *
     * @param {object} params
     * Parameters to load container.
     * It MUST contain at least one of the following properties: file or text.
     * If both properties are passed, load in order of priority: text, file.
     *
     * @param {string?} params.text
     * A string that has HTML document with container.
     *
     * @param {string?} params.file
     * File path to HTML document with container.
     *
     * @param {string?} params.id
     * The `id` attribute of the target container.
     * If not, detect the first `<alier-container>` element as the target container.
     * {@link parseHtmlToContainer}
     *
     * @returns {Element}
     * A contents newly stored to the target `ViewLogic`'s container.
     *
     * @throws {TypeError}
     * - when none of the following properties are included in params: text or file.
     * - when the given params.text is not a string.
     * - when the given params.file is not a string.
     * - when the given params.id is neither a string nor null.
     *
     * @throws {ReferenceError}
     * - when the loaded contents from the given target does not contain an element with the given id.
     * - when the loaded contents from the given target does not contain an element named "alier-container".
     */
    loadContainerSync(params) {
        const { text, file, id: container_id } = params;

        if (text == null && file == null) {
            throw new TypeError(
                "MUST contain at least one of the following properties: text or file"
            );
        }

        const load_container_from_text = (loaded_text) => {
            let loaded_container;
            try {
                loaded_container = ViewLogic.parseHtmlToContainer(loaded_text, container_id);
            } catch (e) {
                let message;
                if (container_id != null) {
                    // load priority: text, file
                    const target = text != null ? "the given text" : file;
                    message = `element with id "${container_id}" does not exist in "${target}"`;
                } else {
                    message = "couldn't find the <alier-container> element.";
                }
                throw new ReferenceError(message, { cause: e });
            }

            this.setContainer(loaded_container);

            return this.#container;
        }

        // load from text
        if (text != null) {
            if (typeof text !== "string") {
                throw new TypeError("The text property must be a string");
            }

            return load_container_from_text(text);
        }

        // load from file
        ///  FOR NATIVE APP ---
        if (typeof file !== "string") {
            throw new TypeError("The file property must be a sring");
        }

        return load_container_from_text(Alier.Native.loadTextSync(file));
        ///  --- FOR NATIVE APP
    }

    /**
     * Replaces the current contents with a grid container composed of
     * `Element`s related with the target `ViewLogic`.
     * 
     * @param {string[] | (string[])[] } gridTemplateAreas 
     * An array representing the `grid-template-areas` CSS property.
     * Each of its entries represents layout of cells of the corresponding row.
     * 
     * Each of cells in this argument represents an identifier to be declared in the `grid-area` CSS property.
     * 
     * @param {Map<string, string> | { [element_name: string]: string }} gridAreaMap 
     * An object or a `Map` representing identifiers specified in the `grid-area`s of corresponding elements.
     * 
     * @param {object} gridContainerStyleOptions 
     * an object representing additional CSS properties applied to the grid container to be created.
     * 
     * @returns replaced contents.
     * 
     * @see {@link https://developer.mozilla.org/en-US/docs/Web/CSS/grid-template-areas}
     * @see {@link https://developer.mozilla.org/en-US/docs/Web/CSS/grid-area}
     */
    replaceWithGrid(gridTemplateAreas, gridAreaMap, gridContainerStyleOptions) {
        const errors = [];

        const grid_template_areas     = gridTemplateAreas ?? [];
        const container_style_options = gridContainerStyleOptions ?? {};
        const grid_area_map           = gridAreaMap ?? {};
        const related_elements        = this.getRelatedElements();
        const grid_container          = document.createElement("div");

        if (!Array.isArray(grid_template_areas)) {
            errors.push(new TypeError(
                `Given 'gridTemplateAreas' (${gridTemplateAreas}) is not an array`
            ));
        }
        if (typeof grid_area_map !== "object") {
            errors.push(new TypeError(
                `Given 'gridAreaMap' (${gridAreaMap}) is not an object`
            ));
        }
        if (typeof container_style_options !== "object") {
            errors.push(new TypeError(
                `Given 'gridContainerStyleOptions' (${gridContainerStyleOptions}) is not an object`
            ));
        }

        grid_container.style.display = "grid";
        for (const k in container_style_options) {
            if (k === "display"             ||
                k === "grid"                ||
                k === "gridTemplate"        ||
                k === "gridTemplateArea"    ||
                k === "gridAutoColumns"     ||
                k === "gridAutoRows"        ||
                k === "gridAutoFlow"
            ) { continue; }
            if (!Object.prototype.hasOwnProperty.call(container_style_options, k)) { continue; }

            grid_container.style[k] = container_style_options[k];
        }

        const grid_area_names = new Set();

        {
            let grid_template_areas_css = "";
            let n_cols = -1;
            for (const i of grid_template_areas.keys()) {
                const template_area  =  grid_template_areas[i];
                const template_area_ = (typeof template_area === "string") ?
                    template_area.split(/[\t\x20]+/) :
                    template_area
                ;

                if (!Array.isArray(template_area_)) {
                    const suffix = ["th", "st", "nd", "rd", "th"][Math.min(i % 10, 4)];
                    errors.push(new TypeError(
                        `${i + suffix} row of the given 'gridTemplateAreas' (${gridTemplateAreas}) is not an array`
                    ));
                }
                if (template_area_.length === 0) {
                    const suffix = ["th", "st", "nd", "rd", "th"][Math.min(i % 10, 4)];
                    errors.push(new TypeError(
                        `${i + suffix} row of the given 'gridTemplateAreas' (${gridTemplateAreas}) is an empty array`
                    ));
                }

                if (n_cols <= 0) {
                    n_cols = template_area_.length;
                } else if (n_cols !== template_area_.length) {
                    const suffix = ["th", "st", "nd", "rd", "th"][Math.min(i % 10, 4)];
                    errors.push(new TypeError(
                        `${i + suffix} row of the given 'gridTemplateAreas' (${gridTemplateAreas}) does not have the same length as the other rows`
                    ));
                }

                for (const j of template_area_.keys()) {
                    const area_name = template_area_[j];
                    if (typeof area_name !== "string") {
                        const i_suffix = ["th", "st", "nd", "rd", "th"][Math.min(i % 10, 4)];
                        const j_suffix = ["th", "st", "nd", "rd", "th"][Math.min(j % 10, 4)];
                        errors.push(new TypeError(
                            `Entry at ${i + i_suffix} row and ${j + j_suffix} column of the given 'gridTemplateAreas' (${gridTemplateAreas}) is not a string`
                        ));
                    }

                    if (errors.length > 0) { continue; }

                    grid_area_names.add(area_name);
                }

                if (errors.length > 0) { continue; }

                grid_template_areas_css += `"${template_area_.join(" ")}"\n`;
            }

            grid_container.style.gridTemplateAreas = grid_template_areas_css;
        }

        const grid_area_map_ = (grid_area_map instanceof Map) ?
            grid_area_map :
            new Map(Object.entries(grid_area_map))
        ;
        for (const [k, grid_area] of grid_area_map_) {
            if (typeof k !== "string") {
                errors.push(new TypeError(
                    `Given 'gridAreaMap' (${gridAreaMap})'s key (${k}) is not a string`
                ));
            }
            if (typeof grid_area !== "string") {
                errors.push(new TypeError(
                    `Given 'gridAreaMap' (${gridAreaMap})'s value (${grid_area}) is not a string`
                ));
            }

            const related_element = related_elements[k];

            if (related_element == null) {
                errors.push(new RangeError(
                    `On mapping ${k} to ${grid_area}: '${k}' is not related with the target ProtoViewLogic (${this.constructor.name}:${this.name})`
                ));
            }
            if (!grid_area_names.has(grid_area)) {
                errors.push(new RangeError(
                    `On mapping ${k} to ${grid_area}: '${grid_area}' is not defined in the given 'gridAreas' (${grid_template_areas})`
                ));
            }

            if (errors.length > 0) { continue; }

            /** @type {HTMLElement} */
            let grid_cell = null;
            if (Array.isArray(related_element)) {
                const div = document.createElement("div");
                div.setAttribute("id", k);
                div.append(...related_element);
                div.style.gridColumnStart = grid_area.gridColumnStart;
                grid_container.append(div);
                grid_cell = div;
            } else {
                grid_container.append(related_element);
                grid_cell = related_element;
            }
            grid_cell.style.gridArea = grid_area;
        }

        if (errors.length > 0) {
            const messages = errors.map(e => {
                return (e instanceof AggregateError) ?
                    e.message :
                    `${e.constructor.name}: ${e.message}`
                ;
            });
            throw new AggregateError(errors, `:\n\t${messages.join("\n\t")}`);
        }

        return this.setContainer(grid_container);
    }

    /**
     * Attaches the given ViewLogic to the given AlierView.
     * 
     * Suppose `vl` is the given ViewLogic and `av` is the given AlierView,
     * then this function is equivalent to `av.attach(vl)`.
     * 
     * @param {ViewLogic} containerToBeAttached
     * ViewLogic to be attached.
     * 
     * @param {AlierView} newHost
     * AlierView to which the given ViewLogic will be attached.
     * 
     * @returns
     * detached ViewLogic if it was attached, `null` otherwise.
     * 
     * @see
     * - {@link AlierView.prototype.attach}
     */
    static attachTo(containerToBeAttached, newHost) {
        const vl = containerToBeAttached;
        const new_host = newHost;
        const old_host = vl.#host;

        if (!(vl instanceof ViewLogic)) {
            throw new TypeError(`${vl} is not a ${ViewLogic.name}`);
        } else if (!(new_host instanceof AlierView)) {
            throw new TypeError(`${new_host} is not a ${AlierView.name}`);
        } else if (new_host === old_host) {
            return null;
        } else if (new_host.container !== vl) {
            return new_host.attach();
        }

        let detached_container = null;
        if (old_host !== null) {
            detached_container = old_host.detach();
        }

        vl.#host = new_host;

        vl.post(
            vl.message("vl$attached", null, {
                newHost: new_host
            })
        );

        return detached_container;
    }
    
    /**
     * Detaches the given ViewLogic from the given AlierView.
     * 
     * Suppose `vl` is the given ViewLogic and `av` is the given AlierView,
     * then this function is equivalent to `av.detach()` if `vl` is attached to `av`.
     * 
     * @param {ViewLogic} containerToBeDetached
     * ViewLogic to be detached.
     * 
     * @param {AlierView} oldHost
     * AlierView from which the given ViewLogic will be detached.
     * 
     * @returns
     * detached ViewLogic if it was attached, `null` otherwise.
     * 
     * @see
     * - {@link AlierView.prototype.detach}
     */
    static detachFrom(containerToBeDetached, oldHost) {
        const vl = containerToBeDetached;
        const old_host = oldHost;

        if (!(vl instanceof ViewLogic)) {
            throw new TypeError(`${vl} is not a ${ViewLogic.name}`);
        } else if (!(old_host instanceof AlierView)) {
            throw new TypeError(`${old_host} is not a ${AlierView.name}`);
        } else if (old_host !== vl.#host) {
            return null;
        } else if (old_host.container !== null) {
            return old_host.detach();
        }

        vl.#container.remove();
        vl.#styles.remove();
        vl.#host = null;

        vl.post(
            vl.message("vl$detached", null, {
                oldHost: old_host
            })
        );

        return vl;
    }

    /**
     * Parses the given HTML text and obtains an element having the given id as `id` attribute value from the parse result.
     * 
     * @param {string} html 
     * A string representing HTML contents to be parsed.
     * 
     * @param {string?} containerId 
     * A string representing a value of the `id` attribute of an element to be obtained as a result.
     * If not, detect the first `<alier-container>` element as the target container.
     * 
     * @returns
     * the `Element` having the given id obtained from the document parsed from the given HTML text. 
     *
     * @throws {TypeError} 
     * -  when the invalid HTML was provided
     * 
     * @throws {ReferenceError} 
     * -  when the given selectors did not match any element in the given HTML
     */
    static parseHtmlToContainer(html, containerId) {
        const container_id = containerId;

        if (typeof html !== "string") {
            throw new TypeError(`${html} is not a string`);
        }

        const doc = ViewLogic.#DOM_PARSER.parseFromString(html, "text/html");
        const container = typeof container_id === "string" ?
            doc.getElementById(container_id) :
            doc.querySelector("alier-container")
        ;

        if (container == null) {
            if (typeof container_id === "string") {
                throw new ReferenceError(`The given selectors (${container_id}) does not match any element in the given HTML`);
            } else {
                throw new ReferenceError(`There is no alier-container element`);
            }
        }

        container.remove();
        container.prepend(...Array.from(doc.head.children));

        //  Import custom tags into the main document.
        const stack = [container];
        while (stack.length > 0) {
            const element = stack.pop();

            if (!(element instanceof HTMLElement)) { continue; }
            
            stack.push(...Array.from(element.children));

            if (!element.tagName.includes("-")) { continue; }
            //  importNode() creates a clone of `element`.
            //  The definition of the custom tag is applied to the clone.
            const imported_element = document.importNode(element, false);
            element.replaceWith(imported_element);
        }

        return container;
    }
    
    constructor() {
        super();
        const styles = document.createElement("div");
        styles.append(this.#styles);
    }

    /**
     * Captures elements defining CSS rules from the given element.
     * 
     * This function may modify the given element's DOM tree structure,
     * i.e. the function removes &lt;link rel="stylesheet"&gt; and &lt;style&gt; elements from the given element.
     * 
     * If the contents include &lt;link rel="stylesheet"&gt; elements referring to
     * the css file located in the app specific directory,
     * replaces each of them with an equivalent &lt;style&gt; element asynchronously.
     * 
     * @param {Element} rootElement 
     * An element containing elements defining styles.
     * 
     * @returns 
     * A &lt;div&gt; element containing captured elements defining CSS rules.
     */
    static #captureStyles(rootElement) {
        const captured_styles = [];

        for (const external_css of rootElement.querySelectorAll( ":scope link[rel=\"stylesheet\"][href]")) {

            /// FOR NATIVE APP ONLY ---
            //  The href property automatically inserts the base URL if the original attribute does not start with it.
            //  Hence use getAttribute("href") here instead.
            const href = external_css.getAttribute("href").trim();

            //  href might be capitalized, so the test must be done case-insensitively.
            if (!/^https?:/i.test(href)) {
                external_css.href = "";  // erase file path for avoiding to cause File Not Found error.
                Alier.Native.loadText(href).then(css_text => {
                    //  replace each of <link> elements referring to the local css file
                    //  with the <style> element containing the css rules defined in the file.
                    const style = document.createElement("style");
                    style.textContent = css_text;
                    external_css.replaceWith(style);
                });
            }
            /// --- FOR NATIVE APP ONLY

            captured_styles.push(external_css);
        }

        captured_styles.push(...rootElement.querySelectorAll(":scope style"));

        const styles = document.createElement("div");
        styles.append(...captured_styles);

        return styles;
    }

    /**
     * @param {Element} container 
     */
    #addInternalLinkEquivalents(container) {
        for (const a of container.querySelectorAll("a[href^=\\#]")) {
            let id     = a.hash.slice(1);
            /** @type {Element?} */
            let   target = null;
            /** @type {DocumentFragment | Document | null} */
            let   root   = null;
            const listener = (ev) => {
                if (target == null) {
                    if (root == null) {
                        let root_ = this.#container;
                        while (!((root_ instanceof DocumentFragment) || (root_ instanceof Document) || root_ == null)) {
                            root_ = root_.parentNode;
                        }
                        if (root_ == null) { return; }
                        root = root_;
                    }
                    let target_ = id.length > 0 ? root.getElementById(id) : this.#container;
                    if (target_ == null) {
                        const id_ = a.hash.slice(1);
                        if (id_.length === 0) {
                            id = id_;
                            target_ = this.#container;
                        } else if (id_ !== id) {
                            id = id_;
                            target_ = root.getElementById(id);
                        }
                        if (target_ == null) { return; }
                    }
                    target = target_;
                }

                target.scrollIntoView(true);
                ev.preventDefault();
            };

            a.addEventListener("click", listener, { passive: false });
        }
    }
    
    /**
     * @type {Promise<Element> | null}
     */
    #deferred_container = null;

    /**
     * A &lt;div&gt; element used as a parent of &lt;style&gt; elements.
     * 
     * @type {HTMLDivElement}
     * @see {@link ViewLogic.prototype.styles}
     */
    #styles = document.createElement("div");
    
    /**
     * contents stored in the container.
     * 
     * @type {Element}
     * @see {@link ViewLogic.prototype.container}
     */
    #container = document.createElement("div");
    
    /**
     * a {@link AlierView} attaching this ViewLogic.
     * 
     * @type {AlierView | null}
     * @see {@link ViewLogic.prototype.host}
     */
    #host = null;
    
    /**
     * A DOMParser used for parsing HTML strings.
     */
    static #DOM_PARSER = new DOMParser();
}

export { ViewLogic };
