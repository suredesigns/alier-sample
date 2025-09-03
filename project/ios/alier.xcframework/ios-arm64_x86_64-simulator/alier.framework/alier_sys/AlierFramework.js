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

const defineIfNotDefined = (tag, ctor, options = undefined) => {
    if (customElements.get(tag) === undefined) {
        customElements.define(tag, ctor, options);
    }
};

import { AlierModel } from "/alier_sys/AlierModel.js";
import { setupModelInterface, setupModelInterfaceFromText } from "/alier_sys/SetupInterface.js";
import { ProtoViewLogic } from "/alier_sys/ProtoViewLogic.js";
import { ViewLogic } from "/alier_sys/ViewLogic.js";
import { AlierView } from "/alier_sys/AlierView.js";
import { ListView } from "/alier_sys/ListView.js";

/**
 * Setup Alier environment.
 *
 * Define custome elements:
 *
 * - alier-view
 * - alier-list-view
 * - alier-app-view
 * - alier-container
 *
 * Add Alier.View to the body of the document to deploy the Alier application.
 */
function setupAlier() {
    if (!("View" in Alier)) {
        // <========= mobile only ==========
        defineIfNotDefined("alier-view", AlierView);
        defineIfNotDefined("alier-container", class ContainerView extends HTMLElement {});
        defineIfNotDefined("alier-list-view", ListView);
        // ========== mobile only =========>

        defineIfNotDefined("alier-app-view", class AppView extends AlierView {});
        Object.defineProperty(Alier, "View", {
            value     : document.createElement("alier-app-view"),
            writable  : true,
            enumerable: true
        });
        document.body.appendChild(Alier.View);
    }
}

export {
    setupAlier,
    AlierModel,
    ViewLogic,
    ListView,
    setupModelInterfaceFromText,
    setupModelInterface,
    AlierView,
    ProtoViewLogic,
};
