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
 * NOTE FOR IMPLEMENTORS:
 * If you add some functionality in this script,
 * you shan't forget add them as properties of the `globalThis.AlierPlatformSpecifics` which is defined at the end of this script.
 */
(() => {
"use strict";
const PLATFORM_NAME = "Android";

const argsReplacer = (v) => {
    return v === null ? "null" : v;
};

function functionDelegate(function_name, callback_handle, args) {
    const json = JSON.stringify({
        function_name: function_name,
        callback_handle: callback_handle,
        args: args.map(argsReplacer)
    });
    return Android.functionCallReceiver(json);
}
    
function functionDelegateSync(function_name, args) {
    const json =  JSON.stringify({
        function_name: function_name,
        args: args.map(argsReplacer)
    });
    const result_json = Android.functionCallReceiverSync(json);
    return result_json;
}
    
/**
 * Send a message to the Native land.
 * 
 * @param {string} message a string representing the message to be sent.
 * `"default"` is set as the default value.
 */
async function _sendstat(message = "default") {
    return Android.recvstat(message);
}

/**
 * Load a text file asynchronously from the Native land.
 *
 * @param {string} filepath
 * a string representing the file path.
 * @return {Promise<string>}
 * the loaded text.
 */
async function loadText (filepath) {
    return await Alier.Native.loadText(filepath);
}

/**
 * Load a text file synchronously from the Native land.
 *
 * @param {string} filepath
 * a string representing the file path.
 * @return {string}
 * the loaded text.
 */
async function loadTextSync (filepath) {
    return await Alier.Native.loadTextSync(filepath);
}

globalThis.AlierPlatformSpecifics = {
    functionDelegate: functionDelegate,
    functionDelegateSync: functionDelegateSync,
    _sendstat: _sendstat,
    loadText: loadText,
    loadTextSync: loadTextSync
};
})();
