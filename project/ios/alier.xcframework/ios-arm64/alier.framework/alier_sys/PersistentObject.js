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

import { Singleton } from "/alier_sys/Singleton.js";

/**
 * A generic class of data objects that persist on disk.
 * 
 * This class extends {@link Singleton} class,
 * so the derived classes of this class also behave as singletons.
 * 
 * By default, instances of the derived classes are automatically
 * saved on and loaded from disk at certain check points.
 * 
 * If you need to save a certain instance manually, you can use
 * {@link save()} method with that instance.
 */
class PersistentObject extends Singleton {
    /**
     * A string representing the file path where a snapshot of
     * the target `PersistentObject` is stored.
     * @type {string}
     */
    #data_path;

    constructor() {
        super();
    }

    /**
     *  super.initialize() invokes the given initializer and returns
     * `this` on the first call for each `new.target`.
     * On subsequent calls, initialize() just returns
     * the instance that previously initialized.
    */
    initialize(initializer) {
        return super.initialize(() => {
            this.setAutoSave();
            const class_name = this.constructor.name;
            this.#data_path  = `/app_data/${class_name}.json`;
            this.load();
            this.save();
           if (initializer != null) { initializer(); }
        });
    }

    /**
     * Saves the target `PersistentObject` on disk.
     */
    save() {
        Alier.Native.saveTextSync(this.#data_path, JSON.stringify(this), true);
    }

    /**
     * Loads the saved data from disk.
     * 
     * @returns {this}
     * the target `PersistentObject`.
     */
    load() {
        const serialized_data   = Alier.Native.loadTextSync(this.#data_path);
        if (serialized_data == null) { return this; }

        const deserialized_data = JSON.parse(serialized_data);
        if (deserialized_data == null) { return this; }

        //  Update the existing properties with the loaded data.
        for(const key in deserialized_data) {
            if (!(key in this)) { continue; }
            this[key] = deserialized_data[key];
        }
        return this;
    }

    /**
     * Enables autosave feature.
     * 
     * While autosave is enabled, the target `PersistentObject` is saved
     * automatically whenever the application enters the background.
     */
    setAutoSave() {
        Alier.SysEvent.addListener((message) => {
            if (message.id === "onEnterBackground") {
                this.save();
            }else
            if(message.id === "onLeaveForeground"){
                this.save();
            }
        });
    }
    
}

export { PersistentObject };
