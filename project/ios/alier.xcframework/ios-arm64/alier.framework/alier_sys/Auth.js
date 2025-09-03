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

/// Platform Specific -->
import { Envelope } from "/alier_sys/Envelope.js";
/// <-- Platform Specific

/**
 * @template {string} T Error code types.
 */
class AuthError extends Error {
    /**
     * @type {T|"UNKNOWN"}
     */
    code;

    /**
     * @type {unknown}
     */
    info;

    /**
     * @param {string} message Error message.
     * @param {T} [code] Error code.
     * @param {{cause?: unknown, info?: unknown}} [options]
     */
    constructor(message, code, options) {
        let code_, options_;
        if (typeof message !== "string") {
            throw new TypeError("message must be string");
        }
        if (typeof code === "string") {
            code_ = code;
            options_ = options;
        } else if (typeof code === "object") {
            code_ = "UNKNOWN";
            options_ = code;
        } else {
            throw new TypeError(
                "optional code must be string and options must be object",
            );
        }
        super(message, options_);
        this.code = code_;
        this.info = options_?.info;
    }

    toString() {
        let obj = Object(this);
        if (obj !== this) {
            throw new TypeError();
        }

        let name = this.name;
        name = name === undefined ? "Error" : String(name);

        let msg = this.message;
        msg = msg === undefined ? "" : String(msg);

        let code = this.code;
        code = code === undefined ? "" : String(code);
        if (code !== "") {
            msg = msg === "" ? `[${code}]` : `[${code}] ${msg}`;
        }

        if (name === "") {
            return msg;
        }
        if (msg === "") {
            return name;
        }

        return name + ": " + msg;
    }
}

class DeauthorizedError extends AuthError {}

class AbortAuthError extends AuthError {
    static get code() {
        return "ABORT";
    }

    /**
     * @param {string} message
     * @param {ErrorOptions} options
     */
    constructor(message, options) {
        super(message, AbortAuthError.code, options);
    }
}

class CancelAuthError extends AuthError {
    static get code() {
        return "CANCELLED";
    }

    /**
     * @param {string} message
     * @param {ErrorOptions} options
     */
    constructor(message, options) {
        super(message, CancelAuthError.code, options);
    }
}

class TimeoutAuthError extends AuthError {
    static get code() {
        return "TIMEOUT";
    }

    /**
     * @param {string} message
     * @param {ErrorOptions} options
     */
    constructor(message, options) {
        super(message, TimeoutAuthError.code, options);
    }
}

/**
 * @typedef {{
 *      method: string,
 *      url: string,
 * }} RequestEndpoint
 */

/**
 * Authentication information obtained by the authentication protocol.
 * Create an inherited class for each authentication protocol.
 * @interface
 */
class IAuthKey {
    /**
     * Format authentication information for Authorization header field.
     * @abstract
     * @async
     * @param {RequestEndpoint} request WebApi request.
     * @returns {Promise<string|null>}
     * Formatted string for Authorization or null.
     */
    async toAuthorizationField(request) {
        throw new Error("Not implemented");
    }
}

/**
 * @template {IAuthKey} T
 */
class AuthEntity {
    /**
     * @type {T|null}
     */
    #authKey;
    /**
     * @type {string|null}
     */
    #protocolId;
    /**
     * @type {boolean}
     */
    #revoked;

    /**
     * @overload
     */
    /**
     * @overload
     * @param {string} protocolId
     */
    /**
     * @overload
     * @param {T} authKey
     * @param {string} [protocolId]
     */
    /**
     * @param {T|string} [authKeyOrProtocolId]
     * @param {string} [protocolIdOrUndefined]
     */
    constructor(authKeyOrProtocolId, protocolIdOrUndefined) {
        let authKey, protocolId;
        if (
            authKeyOrProtocolId instanceof IAuthKey &&
            (typeof protocolId === "string" || protocolId == null)
        ) {
            authKey = authKeyOrProtocolId;
            protocolId = protocolIdOrUndefined ?? null;
        } else if (
            typeof authKeyOrProtocolId === "string" &&
            protocolIdOrUndefined == null
        ) {
            authKey = null;
            protocolId = authKeyOrProtocolId;
        } else if (authKeyOrProtocolId == null && protocolIdOrUndefined == null) {
            authKey = null;
            protocolId = null;
        } else {
            let errMsg;
            if (authKeyOrProtocolId instanceof IAuthKey) {
                errMsg = "protocolId as second param must be string or undefined";
            } else if (
                typeof authKeyOrProtocolId === "string" ||
                authKeyOrProtocolId == null
            ) {
                errMsg = "second param must be undefined because first param is string";
            } else {
                errMsg = "first param must be IAuthKey, string or undefined";
            }
            throw new TypeError(errMsg);
        }
        this.#authKey = authKey;
        this.#protocolId = protocolId;
        this.#revoked = false;
    }

    get protocolId() {
        if (this.#revoked) {
            throw new DeauthorizedError();
        }
        return this.#protocolId;
    }

    get revoked() {
        return this.#revoked;
    }

    /**
     * Revoke the authentication information and return it.
     * If already revoked, return null.
     * @returns {{ authKey: T?, protocolId: string? }}
     */
    revoke() {
        if (this.#revoked) {
            return { authKey: null, protocolId: this.#protocolId };
        }
        const authKey = this.#authKey;
        const protocolId = this.#protocolId;
        this.#revoked = true;
        this.#authKey = null;
        return { authKey, protocolId };
    }

    /**
     * @async
     * @param {RequestEndpoint} request
     * @returns {Promise<string?>}
     * @see {@link IAuthKey.toAuthorizationField}
     */
    async toAuthorizationField(request) {
        return await this.#authKey.toAuthorizationField(request);
    }
}

/**
 * Store and get the authentication information
 * @interface
 */
class IAuthRepository {
    /**
     * @abstract
     * @async
     * @returns {Promise<AuthEntity|null>}
     */
    async getEntity() {
        throw new Error("Not implemented");
    }

    /**
     * @abstract
     * @async
     * @param  {AuthEntity} entity
     * @param {Promise<boolean>}
     */
    async store(entity) {
        throw new Error("Not implemented");
    }

    /**
     * @abstract
     * @async
     * @returns {Promise<AuthEntity>}
     */
    async clear() {
        throw new Error("Not implemented");
    }
}

/**
 * The authentication protocol.
 * @interface
 */
class IAuthProtocol {
    /**
     * Get authorization scheme.
     * @abstract
     * @static
     * @returns {string}
     */
    static get scheme() {
        throw new Error("Not implemented");
    }

    /**
     * Authenticate the user.
     * @abstract
     * @async
     * @param {object} [options]
     * @param {string} [options.protocolId]
     * @returns {Promise<{
     *      ok: boolean,
     *      entity?: AuthEntity|null,
     *      failed?: {code: string, message: string},
     *      info?: any,
     * }>}
     */
    async auth(options) {
        throw new Error("Not implemented");
    }

    /**
     * Revoke the authentication information.
     * @abstract
     * @async
     * @param {AuthEntity} entity
     * @param {object} [options]
     * @returns {Promise<{
     *      ok: boolean,
     *      failed?: {code: string, message: string},
     *      info?: any,
     *      newEntity?: AuthEntity,
     * }>}
     */
    async revoke(entity, options) {
        throw new Error("Not implemented");
    }

    /**
     * Refresh the authentication information if possible.
     * @abstract
     * @async
     * @param {AuthEntity} entity
     * @param {object} [options]
     * @returns {Promise<{
     *      ok: boolean,
     *      newEntity?: AuthEntity|null,
     *      failed?: {code: string, message: string},
     *      info?: any,
     * }>}
     */
    async refresh(entity, options) {
        throw new Error("Not implemented");
    }
}

/**
 * The agent for authentication.
 * @interface
 */
class IAuthAgent {
    /**
     * Agent id.
     * @abstract
     * @returns {string}
     */
    get id() {
        throw new Error("Not implemented");
    }

    /**
     * Log-in the user using protocols.
     * @abstract
     * @async
     * @param {object} [options]
     * @returns {Promise<{ ok: boolean, code?: string }>}
     */
    async login(options) {
        throw new Error("Not implemented");
    }

    /**
     * Log-out the user.
     * @abstract
     * @async
     * @returns {Promise<boolean>}
     */
    async logout() {
        throw new Error("Not implemented");
    }

    /**
     * Refresh the authentication information if possible.
     * @abstract
     * @async
     * @returns {Promise<boolean>}
     */
    async refresh() {
        throw new Error("Not implemented");
    }

    /**
     * @abstract
     * @async
     * @param {RequestEndpoint} request
     * @returns {Promise<{ authorization: string }|null>}
     * @see {@link AuthEntity.toAuthorizationField}
     */
    async getHeaders(request) {
        throw new Error("Not implemented");
    }

    /**
     * @abstract
     * @returns {boolean}
     */
    get isLoggedIn() {
        throw new Error("Not implemented");
    }
}

/** @type {Map<string, IAuthAgent>} */
const agents = new Map();

const AgentRepository = Object.freeze({
    /**
     * @param {IAuthAgent} agent AuthAgent
     * @returns {boolean}
     */
    registerAgent(agent) {
        if (!(agent instanceof IAuthAgent)) {
            return false;
        }
        agents.set(agent.id, agent);
        return true;
    },

    /**
     * @param {string} id AuthAgent id
     * @returns {boolean}
     */
    unregisterAgent(id) {
        return agents.delete(id);
    },

    /**
     * @param {string} id AuthAgent id
     * @returns {IAuthAgent | undefined}
     * The agent corresponds to the id.
     * If there is no corresponding agent, it is undefined.
     */
    pickAgent(id) {
        return agents.get(id);
    },

    /**
     * @param {string} id AuthAgent id
     * @returns {boolean}
     */
    existAgent(id) {
        return agents.has(id);
    },
});

class AuthAgent extends IAuthAgent {
    /**
     * @template T
     * @typedef {(
     *  T | [T, T | { [id: string]: T }] | { [id: string]: T | [T, T | { [id: string]: T }]}
     * )} P
     */
    /**
     * @typedef {P<IAuthProtocol} Protocols
     */
    /**
     * @typedef {P<AuthEntity>} Entities
     */

    /** @type {string} */
    #id;

    /**
     * @type {Protocols}
     */
    #protocols;

    #selectProtocol;

    #nextProtocol;

    /**
     * @type {Entities}
     */
    #entities;

    /**
     * @param {object} args
     * @param {string} args.id Authentication protocol id
     * @param {Protocols} args.protocols Authentication protocols
     * @param {(
     *      (envelope: Envelope) => void
     * )} [args.selectProtocol]
     * @param {(info: any) => string} [args.nextProtocol]
     */
    constructor(args) {
        super();

        const { id, protocols, selectProtocol, nextProtocol } = args;

        if (typeof id !== "string") {
            throw new TypeError("id to construct AuthAgent must be string.");
        }

        const validateProtocolsType = (protocols) => {
            if (protocols instanceof IAuthProtocol) {
                return true;
            }
            const validateObjectOrProtocol = (protocols) => {
                if (typeof protocols !== "object") {
                    return false;
                }
                if (protocols instanceof IAuthProtocol) {
                    return true;
                } else {
                    return [...Object.values(protocols)].every(
                        (p) => p instanceof IAuthProtocol,
                    );
                }
            };
            const validateProtocolList = (protocols) => {
                if (protocols instanceof Array) {
                    if (
                        protocols.length === 2 &&
                        protocols.at(0) instanceof IAuthProtocol &&
                        validateObjectOrProtocol(protocols.at(1))
                    ) {
                        return true;
                    }
                    return false;
                }
                return false;
            };
            if (protocols instanceof Array) {
                return validateProtocolList(protocols);
            }
            if (typeof protocols === "object") {
                return [...Object.values(protocols)].every(
                    (p) => p instanceof IAuthProtocol || validateProtocolList(p),
                );
            }
            return false;
        };
        if (!validateProtocolsType(protocols)) {
            throw new TypeError(
                "protocol must inherit IAuthProtocol or array or object of IAuthProtocol.",
            );
        }

        this.#id = id;
        this.#protocols = protocols;
        this.#selectProtocol = selectProtocol;
        this.#nextProtocol = nextProtocol;
    }

    get id() {
        return this.#id;
    }

    /**
     * Log-in the user using protocols.
     * @async
     * @param {object} [options]
     * @param {string} [options.protocolId]
     * @returns {Promise<{ ok: boolean, code?: string }>}
     */
    async login(options = {}) {
        if (typeof options !== "object" && options != null) {
            throw new TypeError("options must be optional object");
        }

        /**
         * @param {[IAuthProtocol, IAuthProtocol | { [name: string]: IAuthProtocol }]} protocols
         */
        const protocolArray = async (protocols, options) => {
            const protocol1 = protocols.at(0);
            let ok, code, entity1, info;
            ({
                ok,
                code,
                entity: entity1,
                info,
            } = await this.#login(protocol1, options));
            if (!ok) {
                return { ok, code };
            }
            let protocol2 = protocols.at(1);
            let nextId;
            if (!(protocol2 instanceof IAuthProtocol)) {
                nextId = this.#nextProtocol(info);
                protocol2 = protocol2[nextId];
            }
            let entity2;
            ({
                ok,
                code,
                entity: entity2,
            } = await this.#login(protocol2, { protocolId: nextId, ...options }));
            if (!ok) {
                return { ok, code };
            }
            const entities = [entity1, nextId == null ? entity2 : { [nextId]: entity2 }];
            return { ok, entities };
        };

        let ok, code, entities;
        try {
            if (this.#protocols instanceof IAuthProtocol) {
                ({
                    ok,
                    entity: entities,
                    code,
                } = await this.#login(this.#protocols, options));
            } else if (this.#protocols instanceof Array) {
                ({ ok, entities, code } = await protocolArray(this.#protocols, options));
            } else {
                let selected;
                try {
                    const envelope = new Envelope();
                    this.#selectProtocol(envelope);
                    selected = await envelope;
                } catch (err) {
                    return { ok: false, code: err.code ?? "CANCELLED_SELECT_PROTOCOL" };
                }
                const protocols = this.#protocols[selected];
                if (protocols instanceof IAuthProtocol) {
                    let entity;
                    ({ ok, entity, code } = await this.#login(protocols, {
                        protocolId: selected,
                        ...options,
                    }));
                    entities = { [selected]: entity };
                } else {
                    ({ ok, entities, code } = await protocolArray(protocols, {
                        protocolId: selected,
                        ...options,
                    }));
                    entities = { [selected]: entities };
                }
            }
        } catch (err) {
            await this.logout();
            if (err.code == null) {
                Alier.Sys.loge(0, err);
            }
            return { ok: false, code: err.code ?? "UNKNOWN" };
        }
        if (ok) {
            this.#entities = entities;
        }
        return { ok, code };
    }

    /**
     * Log-in the user using protocols.
     * @async
     * @param {IAuthProtocol} protocol
     * @param {object} [options]
     * @param {string} [options.protocolId]
     * @returns {Promise<{
     *      ok: boolean,
     *      entity?: AuthEntity,
     *      code?: string,
     *      info?: any
     * }>}
     */
    async #login(protocol, options) {
        const { ok, entity, failed, info } = await protocol.auth(options);

        if (!ok) {
            Alier.Sys.logw(0, `Failed to login: [${failed.code}] ${failed.message}`);
            if (info != null) {
                let infoText;
                if (info instanceof Error) {
                    infoText = info.toString();
                } else if (typeof info === "string") {
                    infoText = info;
                } else if (typeof info === "object") {
                    infoText = JSON.stringify(info);
                }
            }
            return { ok: false, code: failed.code, info };
        }

        if (entity == null) {
            Alier.Sys.loge(0, "Success to login but no AuthEntity.");
            return { ok: false };
        }

        return { ok: true, entity, info };
    }

    /**
     * Log-out the user.
     * @async
     * @returns {Promise<boolean>}
     */
    async logout() {
        if (!this.isLoggedIn) {
            return true;
        }

        const entities = this.#entities;
        this.#entities = null;

        let ok, failed, info;
        if (entities instanceof AuthEntity) {
            ({ ok, failed, info } = await this.#protocols.revoke(entities));
        } else if (entities instanceof Array) {
            const protocol1 = this.#protocols[0];
            const entity1 = entities[0];
            ({ ok, failed, info } = await protocol1.revoke(entity1));

            let entity2 = entities[1];
            let protocol2;
            if (entity2 instanceof AuthEntity) {
                protocol2 = this.#protocols[1];
            } else {
                let [id, entity2_] = Object.entries(entity2)[0];
                entity2 = entity2_;
                protocol2 = this.#protocols[1][id];
            }
            let ok2, info2;
            ({ ok: ok2, failed, info: info2 } = await protocol2.revoke(entity2));
            ok = ok && ok2;
            if (info2) {
                info = Object.assign(info ?? {}, info2);
            }
        } else {
            const [id, entities_] = Object.entries(entities)[0];
            const protocols = this.#protocols[id];
            if (entities_ instanceof AuthEntity) {
                ({ ok, failed, info } = await protocols.revoke(entities_));
            } else if (entities_ instanceof Array) {
                const protocol1 = protocols[0];
                const entity1 = entities_[0];
                ({ ok, failed, info } = await protocol1.revoke(entity1));

                let entity2 = entities_[1];
                let protocol2;
                if (entity2 instanceof AuthEntity) {
                    protocol2 = protocols[1];
                } else {
                    let [id, entity2_] = Object.entries(entity2)[0];
                    entity2 = entity2_;
                    protocol2 = protocols[1][id];
                }
                let ok2, info2;
                ({ ok: ok2, failed, info: info2 } = await protocol2.revoke(entity2));
                ok = ok && ok2;
                if (info2) {
                    info = Object.assign(info ?? {}, info2);
                }
            }
        }

        if (!ok) {
            Alier.Sys.logw(0, `Failed to logout: [${failed.code}] ${failed.message}`);
            if (info != null) {
                let infoText;
                if (info instanceof Error) {
                    infoText = info.toString();
                } else if (typeof info === "string") {
                    infoText = info;
                } else if (typeof info === "object") {
                    infoText = JSON.stringify(info);
                }
            }
            return false;
        }

        return true;
    }

    /**
     * Refresh the authentication information if possible.
     * @async
     * @returns {Promise<boolean>}
     */
    async refresh() {
        const entities = this.#entities;
        this.#entities = null;

        let ok, newEntities, failed, info;
        if (entities instanceof AuthEntity) {
            ({
                ok,
                newEntity: newEntities,
                failed,
                info,
            } = await this.#protocols.refresh(entities));
        } else if (entities instanceof Array) {
            const entity1 = entities[0];
            const protocol1 = this.#protocols[0];
            let newEntity1;
            ({
                ok,
                newEntity: newEntity1,
                failed,
                info,
            } = await protocol1.refresh(entity1));
            if (ok) {
                let entity2 = entities[1];
                let id2, protocol2;
                if (entity2 instanceof AuthEntity) {
                    protocol2 = this.#protocols[1];
                } else {
                    [id2, entity2] = Object.entries(entity2)[0];
                    protocol2 = this.#protocols[1][id2];
                }
                let newEntity2;
                ({
                    ok,
                    newEntity: newEntity2,
                    failed,
                    info,
                } = await protocol2.refresh(entity2));
                newEntities = [
                    newEntity1,
                    id2 == null ? newEntity2 : { [id2]: newEntity2 },
                ];
            }
        } else {
            const [id1, entitiesInner] = Object.entries(entities)[0];
            const protocols = this.#protocols[id1];
            if (entitiesInner instanceof AuthEntity) {
                ({
                    ok,
                    newEntity: newEntities,
                    failed,
                    info,
                } = await protocols.refresh(entitiesInner));
            } else {
                const entity1 = entitiesInner[0];
                const protocol1 = protocols[0];
                let newEntity1;
                ({
                    ok,
                    newEntity: newEntity1,
                    failed,
                    info,
                } = await protocol1.refresh(entity1));
                if (ok) {
                    let entity2 = entitiesInner[1];
                    let protocol2 = protocols[1];
                    let id2;
                    if (!(entity2 instanceof AuthEntity)) {
                        [id2, entity2] = Object.entries(entity2)[0];
                        protocol2 = protocol2[id2];
                    }
                    let newEntity2;
                    ({
                        ok,
                        newEntity: newEntity2,
                        failed,
                        info,
                    } = await protocol2.refresh(entity2));
                    newEntities = [
                        newEntity1,
                        id2 == null ? newEntity2 : { [id2]: newEntity2 },
                    ];
                }
            }
        }

        if (ok) {
            this.#entities = newEntities;
        } else {
            const revokeEntities = (entities) => {
                if (entities instanceof AuthEntity) {
                    if (!entities.revoked) {
                        entities.revoke();
                    }
                } else if (entities instanceof Array) {
                    if (!entities[0].revoked) {
                        entities[0].revoke();
                    }
                    if (entities[1] instanceof AuthEntity) {
                        if (!entities[1].revoked) {
                            entities[1].revoke();
                        }
                    } else {
                        const entity2 = Object.entries(entities[1])[0][1];
                        if (!entity2.revoked) {
                            entity2.revoke();
                        }
                    }
                } else {
                    const entitiesInner = Object.entries(entities)[0][1];
                    if (entitiesInner instanceof AuthEntity) {
                        if (!entitiesInner.revoked) {
                            entitiesInner.revoke();
                        }
                    } else {
                        if (!entitiesInner[0].revoked) {
                            entitiesInner[0].revoke();
                        }
                        if (entitiesInner[1] instanceof AuthEntity) {
                            if (!entitiesInner[1].revoked) {
                                entitiesInner[1].revoke();
                            }
                        } else {
                            const entity2 = Object.entries(entitiesInner[1])[0][1];
                            if (!entity2.revoked) {
                                entity2.revoke();
                            }
                        }
                    }
                }
            };

            revokeEntities(entities);
            if (newEntities) {
                revokeEntities(newEntities);
            }

            Alier.Sys.logw(
                0,
                `Failed to refresh auth: [${failed.code}] ${failed.message}`,
            );
            if (info != null) {
                let infoText;
                if (info instanceof Error) {
                    infoText = info.toString();
                } else if (typeof info === "string") {
                    infoText = info;
                } else if (typeof info === "object") {
                    infoText = JSON.stringify(info);
                }
            }

            return false;
        }

        return true;
    }

    /**
     * @async
     * @param {RequestEndpoint} request
     * @returns {Promise<{ authorization: string }|null>}
     * @see {@link AuthEntity.toAuthorizationField}
     */
    async getHeaders(request) {
        const authorization = await this.#entities.toAuthorizationField(request);
        return authorization != null ? { authorization } : null;
    }

    get isLoggedIn() {
        return this.#entities != null;
    }
}

/**
 * @typedef DigestChallengeParameters
 * @property {string} [realm]
 * This is QUOTED.
 * A string to be displayed to users so they know which username and password to use.
 * @property {string[]} [domain]
 * URIs that define the protection space.
 * @property {string} nonce
 * This is QUOTED.
 * A server-specified string which is opaque to the client.
 * @property {string} opaque
 * This is QUOTED.
 * A string of data that SHOULD be returned by the client unchanged in Authorization header field of subsequent requests which URIs in the same protection space.
 * @property {boolean} [stale]
 * A case-insensitive flag indicating that the previous request from the client was rejected because the nonce value was stale.
 * If stale is true, the client may with to simply retry the request with a new encrypted response, without re-prompting the use for a new username and password.
 * If stale is false, or the stale parameter is not present, the username and/or password are invalid, and new values MUST be obtained.
 * @property {(
 *      "MD5" | "SHA-256" | "SHA-512-256" |
 *      "MD5-sess" | "SHA-256-sess" | "SHA-512-256-sess"
 * )} [algorithm]
 * This is NOT QUOTED.
 * A string indicating an algorithm used to produce the digest and an unkeyed digest.
 * If this is not present, it is assumed to be "MD5".
 * But "MD5" is not recommended for security reason.
 * @property {("auth"|"auth-int")[]} qop
 * Strings of one or more tokens indicating the "quality of protection" values.
 * @property {"UTF-8"} [charset]
 * @property {boolean} [userhash]
 * The flag that the server supports username hashing.
 */

/**
 * @typedef DigestAuthorizationParameters
 * @property {string} response
 * This is QUOTED.
 * A string of the hex digits
 * @property {string} username
 * This is QUOTED.
 * The user's name in the specified realm.
 * The quoted string contains the name in plaintext or the hash code in hexadecimal notation.
 * If the username contains characters not allowed inside the ABNF quoted-string production,
 * the username* parameter can be used.
 * Sending both username and username* in the same header option MUST be treated as an error.
 * @property {string} usernameStar
 * If the userhash parameter value is set "false" and the username contains characters not allowed inside the ABNF quoted-string production, the user's name can be sent with this parameter, using the extended notation defined in RFC5987.
 * @property {string} realm
 * This is QUOTED.
 * See {@link DigestChallengeParameters.realm}
 * @property {string} uri
 * This is QUOTED.
 * The Effective Request URI of the HTTP request.
 * @property {"auth"|"auth-int"} qop
 * This is NOT QUOTED.
 * Indicates what "quality of protection" the client has applied to the message.
 * Its value MUST be one of the alternatives the server indicated it supports in the WWW-Authenticate header field.
 * {@link DigestChallengeParameters.qop}
 * @property {string} cnonce
 * This is QUOTED.
 * The cnonce value is an opaque quoted ASCII-only string value provided by the client and used by both client and server.
 * @property {string} nc
 * The nc parameter stands for "nonce count".
 * The nc value is hexadecimal count of the number of requests that the client has sent with the nonce value in this request.
 * @property {"true"|"false"} [userhash]
 * Indicates that the username has been hashed. Default value is "false".
 * @property {string} opaque
 * This is QUOTED.
 * See {@link DigestChallengeParameters.opaque}
 * @property {(
 *      "MD5" | "SHA-256" | "SHA-512-256" |
 *      "MD5-sess" | "SHA-256-sess" | "SHA-512-256-sess"
 * )} [algorithm]
 * This is NOT QUOTED.
 * See {@link DigestChallengeParameters.algorithm}
 * @property {string} nonce
 * This is QUOTED.
 * See {@link DigestChallengeParameters.nonce}
 */

class DigestAuthKey extends IAuthKey {
    static #supportedAlgorithms = new Set(["MD5", "SHA-256", "SHA-512-256"]);
    static #quotedParams = new Set([
        "username",
        "realm",
        "nonce",
        "uri",
        "response",
        "cnonce",
        "opaque",
    ]);

    #username;
    #realm;
    #qop;
    #cnonce;
    #userhash;
    #opaque;
    #algorithm;
    #nonce;

    /** @type {Promise<string>} */
    #promiseA1;

    #nonceCounter = 0;
    #encoder = new TextEncoder();

    /**
     * @param {{ username: string, password?: string, a1?: string }} credentials
     * User credentials. Password or a1 required.
     * A1 will be provided at refresh.
     * @param {DigestChallengeParameters} challenge Parameters by challenge response.
     * @param {string} cnonce
     */
    constructor(credentials, challenge, cnonce) {
        super();

        this.#username = credentials.username;

        this.#realm = challenge.realm;
        if (!challenge.qop.includes("auth")) {
            throw new Error();
        }
        this.#qop = "auth";
        this.#userhash = challenge.userhash;
        this.#opaque = challenge.opaque;
        this.#algorithm = challenge.algorithm;
        this.#nonce = challenge.nonce;

        this.#cnonce = cnonce;

        if (typeof credentials.password === "string") {
            const a1Text = `${this.#username}:${this.#realm}:${credentials.password}`;
            this.#promiseA1 = this.encrypt(this.#algorithm, a1Text);
        } else if (typeof credentials.a1 === "string") {
            this.#promiseA1 = Promise.resolve(credentials.a1);
        } else {
            throw new TypeError("Password or a1 required, and they must be string.");
        }
    }

    get username() {
        return this.#username;
    }

    async getA1() {
        return await this.#promiseA1;
    }

    incrementNonceCounter() {
        return (++this.#nonceCounter).toString(16).padStart(8, "0");
    }

    /**
     * Format authentication information for Authorization header field.
     * @async
     * @param {RequestEndpoint} request WebApi request.
     * @returns {Promise<string|null>}
     * Formatted string for Authorization or null.
     */
    async toAuthorizationField(request) {
        const nc = this.incrementNonceCounter();
        const matchUrl = request.url.match(
            /https?:\/\/(?<host>[\w.]+(?::[0-9]+)?)(?<path>(?:\/[^/#?]*)*)/,
        );
        const uri = matchUrl.groups.path;
        const host = matchUrl.groups.host;

        const response = await this.makeResponseHashSha2(request.method, uri, nc);

        const params = {
            response,
            username: this.#username,
            realm: this.#realm ?? `${this.#username}@${host}`,
            uri,
            qop: this.#qop,
            cnonce: this.#cnonce,
            nc,
            userhash: this.#userhash,
            opaque: this.#opaque,
            algorithm: this.#algorithm,
            nonce: this.#nonce,
        };

        const headerParams = new Array();
        for (const [key, value] of Object.entries(params)) {
            if (value == null) {
                continue;
            }
            if (key === "token68") {
                const escapedValue = value.replace('"', '\\"');
                const quotedValue = `"${escapedValue}"`;
                headerParams.push(quotedValue);
            } else if (DigestAuthKey.#quotedParams.has(key)) {
                const escapedValue = value.replace('"', '\\"');
                const quotedValue = `"${escapedValue}"`;
                headerParams.push(`${key}=${quotedValue}`);
            } else {
                headerParams.push(`${key}=${value}`);
            }
        }

        const joinedParams = headerParams.join(", ");
        const field = `${DigestProtocol.scheme} ${joinedParams}`;

        return field;
    }

    async makeResponseHashSha2(method, uri, nc) {
        const a1 = await this.#promiseA1;
        const a2Text = `${method}:${uri}`;

        const a2 = await this.encrypt(this.#algorithm, a2Text);

        const data = `${this.#nonce}:${nc}:${this.#cnonce}:${this.#qop}:${a2}`;
        const secretData = `${a1}:${data}`;
        const response = await this.encrypt(this.#algorithm, secretData);

        return response;
    }

    async encrypt(algorithm, text) {
        if (!DigestAuthKey.#supportedAlgorithms.has(algorithm)) {
            throw new Error(`not supported algorithm: ${algorithm}`);
        }

        const data = this.#encoder.encode(text);
        const hashedBuf = await window.crypto.subtle.digest(algorithm, data);
        const hashedHex = buf2hex(hashedBuf);
        return hashedHex;
    }
}

class DigestProtocol extends IAuthProtocol {
    static #scheme = "Digest";

    static get scheme() {
        return DigestProtocol.#scheme;
    }

    static #defaultCnonceLength = 32;

    static checkHeaderScheme(header) {
        const scheme = header.split(" ")[0];
        return DigestProtocol.scheme.toLowerCase() === scheme.toLowerCase();
    }

    /**
     * @private
     * @type {{
     *      host: string,
     *      path: string,
     *      method: "GET"|"POST"|"PUT"|"DELETE",
     * }}
     */
    #endpoint;

    /**
     * @private
     * @type {number}
     */
    #cnonceLength;

    /**
     * @type {boolean}
     */
    #refreshCred;

    /**
     * @callback GetCredentialsCallback
     * @param {(
     *      Envelope<{
     *          credentials: { username: string, password: string },
     *          envelope: Envelope<boolean>,
     *      }>
     * )} envelope
     * @returns {void}
     */

    /**
     * @type {GetCredentialsCallback}
     */
    #getCredentialsCallback;

    /** @type {number} */
    #challengeTimeoutDelay;
    /** @type {number} */
    #challengeInterval;

    /**
     * @param {object} args
     * @param {string} args.host - The endpoint host.
     * @param {string} args.path - The endpoint path.
     * @param {"GET"|"POST"|"PUT"|"DELETE"} args.method - The endpoint method.
     * @param {GetCredentialsCallback} args.getCredentialsCallback
     * Callback function to submit credentials during `auth` method.
     * @param {number} [args.cnonceLength]
     * An integer value to generate the cnonce; since it is encoded in Base64,
     * the length of the cnonce is not necessarily this integer value.
     * Default value is 32.
     * @param {boolean} [args.refreshCred]
     * Whether to run getCredentials callback if unauthorized at refresh.
     * Default is false.
     * @param {number} [args.challengeTimeoutDelay]
     * Timeout delay [milliseconds] to fetch challenge request.
     * If not positive number, delay is 0.
     * @param {number} [args.challengeInterval]
     * Interval time [milliseconds] to fetch challenge request.
     * If not positive number, interval is 0.
     * If interval is positive, timeout must be also positive.
     */
    constructor(args) {
        super();

        let {
            host,
            path,
            method,
            getCredentialsCallback,
            cnonceLength,
            challengeTimeoutDelay,
            challengeInterval,
        } = args;

        if (
            typeof host !== "string" ||
            typeof path !== "string" ||
            typeof method !== "string"
        ) {
            throw new TypeError(
                "host, path, method, protocol for endpoint must be string",
            );
        }
        this.#endpoint = { host, path, method };

        if (cnonceLength !== undefined && !Number.isInteger(cnonceLength)) {
            throw new TypeError("cnonceLength must be integer");
        }
        this.#cnonceLength = cnonceLength ?? DigestProtocol.#defaultCnonceLength;

        if (typeof getCredentialsCallback !== "function") {
            throw new TypeError("callback must be function");
        }
        this.#getCredentialsCallback = getCredentialsCallback;

        this.#refreshCred =
            typeof args.refreshCred === "boolean" ? args.refreshCred : false;

        this.#challengeTimeoutDelay =
            typeof challengeTimeoutDelay === "number" && challengeTimeoutDelay > 0
                ? challengeTimeoutDelay
                : 0;

        this.#challengeInterval =
            typeof challengeInterval === "number" && challengeInterval > 0
                ? challengeInterval
                : 0;

        if (this.#challengeInterval > 0 && this.#challengeTimeoutDelay === 0) {
            throw new Error(
                "If interval time is positive number, timeout must be also positive.",
            );
        }
    }

    /**
     * @returns {{
     *      host: string,
     *      path: string,
     *      method: "GET"|"POST|PUT|DELETE",
     * }}
     * The endpoint to authentication.
     */
    get endpoint() {
        return this.#endpoint;
    }

    get url() {
        return `${this.endpoint.host}${this.endpoint.path}`;
    }

    /**
     * @typedef {(
     *      ErrCodeChallenge |
     *      ErrCodeChallengeParse |
     *      ErrCodeValid |
     *      "ERR_DIGEST_REJECTED" |
     *      "UNKNOWN"
     * )} ErrCodeAuth
     */

    /**
     * Authenticate the user.
     * @async
     * @param {object} [options]
     * @param {string} [options.protocolId]
     * @param {boolean} [options.retryUnauth]
     * @returns {Promise<{
     *      ok: boolean,
     *      entity?: AuthEntity<DigestAuthKey>|null,
     *      failed?: {
     *          code: ErrCodeAuth,
     *          message: string
     *      },
     *      info?: any,
     * }>}
     */
    async auth(options) {
        const { protocolId, retryUnauth = true } = options ?? {};

        if (typeof protocolId !== "string" && protocolId != null) {
            throw new TypeError("protocolId must be optional string");
        }

        try {
            return await this.#auth({ protocolId, retryUnauth });
        } catch (err) {
            return {
                ok: false,
                failed: { code: err.code ?? "UNKNOWN", message: err.message ?? err },
            };
        }
    }

    async #auth(options = {}) {
        const url = this.url;
        let { protocolId, challenge, retryUnauth } = options;
        let credentials, envelopeFinishAuth;

        if (typeof retryUnauth !== "boolean") {
            throw TypeError(`retry must be boolean: ${typeof retryUnauth}`);
        }

        if (challenge != null) {
            const envelopeCredentials = new Envelope();
            this.#getCredentialsCallback(envelopeCredentials);

            try {
                // async wait for credentials and envelope for notifying to finish auth
                ({ credentials, envelope: envelopeFinishAuth } =
                    await envelopeCredentials);
            } catch (err) {
                const msg = "Cancelled to input credentials";
                if (err instanceof Error) {
                    throw new CancelAuthError(err.message ?? msg, { cause: err });
                } else {
                    throw new CancelAuthError(err ?? msg);
                }
            }
        } else {
            ({ challenge, credentials, envelopeFinishAuth } =
                await this.#getCredentialsAndChallenge(url));
        }

        const cnonce = makeRandomBase64(this.#cnonceLength);
        const key = new DigestAuthKey(credentials, challenge, cnonce);

        const controller = new AbortController();

        const validAuthList = [
            this.#validateAuthorization(url, key, { signal: controller.signal }),
        ];
        if (envelopeFinishAuth) {
            validAuthList.push(envelopeFinishAuth);
        }

        let info;
        try {
            info = await Promise.race(validAuthList);
        } catch (err) {
            if (envelopeFinishAuth != null) {
                if (envelopeFinishAuth.done) {
                    // error with envelopeFinishAuth
                    let reason;
                    if (err instanceof Error) {
                        reason = new CancelAuthError(err.message, { cause: err });
                    } else if (typeof err === "string") {
                        reason = new CancelAuthError(err);
                    } else {
                        const msg =
                            "Unknown error with envelope to notify finishing auth";
                        reason = new CancelAuthError(msg);
                    }
                    controller.abort(reason);
                    throw reason;
                } else {
                    // error with validateAuthorization()
                    envelopeFinishAuth.discard(err);
                }
            }

            if (
                retryUnauth &&
                err instanceof AuthError &&
                err.code.startsWith("ERR_DIGEST_VALID_UNAUTH")
            ) {
                const newChallenge = err.info?.challenge ?? challenge;
                return await this.#auth({
                    protocolId,
                    challenge: newChallenge,
                    retryUnauth,
                });
            }
            if (err instanceof AuthError) {
                throw err;
            }
            if (err instanceof Error) {
                const code = err.code ?? "ERR_DIGEST_VALID_UNKNOWN";
                throw new AuthError(
                    err.message ?? "Unknown error to validate authorization",
                    code,
                    { cause: err },
                );
            }
            throw new AuthError(
                err ?? "Unknown error to validate authorization",
                "ERR_DIGEST_VALID_UNKNOWN",
            );
        }


        const entity = new AuthEntity(key, protocolId);

        if (envelopeFinishAuth) {
            envelopeFinishAuth.post();
        }

        return { ok: true, entity, info };
    }

    /**
     * Revoke the authentication information.
     * @async
     * @param {AuthEntity<DigestAuthKey>} entity
     * @param {object} [options]
     * @returns {Promise<{
     *      ok: boolean,
     *      failed?: { code: string, message: string },
     *      info?: any,
     *      newEntity?: AuthEntity,
     * }>}
     */
    async revoke(entity, options) {
        entity.revoke();
        return { ok: true };
    }

    /**
     * @typedef {"ERR_DIGEST_REFRESH_FAILED"|ErrCodeAuth} ErrCodeRefresh
     */

    /**
     * Refresh the authentication information if possible.
     * @async
     * @param {AuthEntity<DigestAuthKey>} entity
     * @param {object} [options]
     * @returns {Promise<{
     *      ok: boolean,
     *      newEntity?: AuthEntity<DigestAuthKey>|null,
     *      failed?: { code: ErrCodeRefresh, message: string },
     *      info?: any,
     * }>}
     */
    async refresh(entity, options) {
        const { authKey: oldKey, protocolId } = entity.revoke();

        if (oldKey != null) {
            const a1 = await oldKey.getA1();
            const url = this.url;
            let challenge;
            try {
                challenge = await this.#getChallenge(url);
            } catch (err) {
                const errCode = Object.hasOwn(err, "code")
                    ? err.code
                    : "ERR_DIGEST_CHALL_UNKNOWN";
                return { ok: false, failed: { code: errCode, message: err.message } };
            }
            const cnonce = this.#generateCnonce();
            const newKey = new DigestAuthKey(
                { username: oldKey.username, a1 },
                challenge,
                cnonce,
            );
            let info;
            try {
                info = await this.#validateAuthorization(url, newKey);
            } catch (err) {
                const errCode = Object.hasOwn(err, "code")
                    ? err.code
                    : "ERR_DIGEST_VALID_UNKNOWN";
                return { ok: false, failed: { code: errCode, message: err.message } };
            }

            const newEntity = new AuthEntity(newKey, protocolId);
            return { ok: true, newEntity, info };
        }

        if (this.#refreshCred) {
            const { ok, entity, failed, info } = await this.auth({
                protocolId,
                ...options,
            });
            return { ok, newEntity: entity, failed, info };
        }

        return {
            ok: false,
            failed: { code: "ERR_DIGEST_REFRESH_FAILED", message: "Failed to refresh" },
        };
    }

    #generateCnonce() {
        return makeRandomBase64(this.#cnonceLength);
    }

    async #getCredentialsAndChallenge(url) {
        const controller = new AbortController();
        const signal = controller.signal;
        const envelopeFinishChallenge = new Envelope();

        // Get challenge request
        const getChallenge = async () => {
            try {
                const challenge = await this.#getChallenge(url, { signal });
                return challenge;
            } catch (err) {
                if (err instanceof AuthError) {
                    throw err;
                } else if (err.name === "AbortError") {
                    throw new AbortAuthError(err.message, { cause: err });
                } else if (err instanceof Error) {
                    const code = Object.hasOwn(err, "code")
                        ? err.code
                        : "ERR_DIGEST_CHALL_UNKNOWN";
                    throw new AuthError(err.message, code, { cause: err });
                }
                throw new AuthError(err, "ERR_DIGEST_CHALL_UNKNOWN");
            } finally {
                envelopeFinishChallenge.post();
            }
        };

        // Get credentials from promise
        const getCredentials = async () => {
            // Envelope to get credentials
            const envelopeCredentials = new Envelope();
            this.#getCredentialsCallback(envelopeCredentials);

            try {
                // async wait for credentials and envelope for notifying to finish auth
                const { credentials, envelope: envelopeFinishAuth } =
                    await envelopeCredentials;
                // set timeout
                if (!envelopeFinishChallenge.done && this.#challengeTimeoutDelay > 0) {
                    // envelope to notify timeout is done
                    const envelopeTimeout = new Envelope();
                    setTimeout(() => {
                        if (
                            !envelopeFinishChallenge.done &&
                            !controller.signal.aborted
                        ) {
                            controller.abort(
                                new TimeoutAuthError("Timeout to get challenge"),
                            );
                        }
                        envelopeTimeout.post();
                    }, this.#challengeTimeoutDelay);
                    // await done timeout or cancelled in view
                    if (envelopeFinishAuth) {
                        await Promise.race([envelopeTimeout, envelopeFinishAuth]);
                    }
                }
                return { credentials, envelopeFinishAuth };
            } catch (err) {
                const msg = "Cancelled to input credentials";
                if (!envelopeFinishChallenge.done) {
                    // abort getChallenge
                    controller.abort(new AbortAuthError(msg));
                }
                if (err instanceof Error) {
                    throw new CancelAuthError(err.message ?? msg, { cause: err });
                } else {
                    throw new CancelAuthError(err ?? msg);
                }
            }
        };

        const [challenge, { credentials, envelopeFinishAuth }] = await Promise.all([
            getChallenge(),
            getCredentials(),
        ]);

        return { challenge, credentials, envelopeFinishAuth };
    }

    /**
     * @typedef {(
     *      "ABORT" |
     *      "TIMEOUT" |
     *      "ERR_DIGEST_CHALL_STATUS" |
     *      "ERR_DIGEST_CHALL_HEADER" |
     *      "ERR_DIGEST_CHALL_FETCH" |
     *      "ERR_DIGEST_CHALL_UNKNOWN"
     * )} ErrCodeChallenge
     */

    /**
     * @async
     * @param {string} url
     * @param {object} [options]
     * @param {AbortSignal} [options.signal]
     * @returns {Promise<DigestChallengeParameters>}
     * @throws {AuthError<ErrCodeChallenge|ErrCodeChallengeParse>}
     */
    async #getChallenge(url, options = {}) {
        const { signal } = options;

        if (signal?.aborted) {
            const err = abortReasonToAuthError(signal.reason);
            throw err;
        }

        const request = new Request(url, { method: this.endpoint.method });

        const envelopeAbort = new Envelope();
        if (signal != null) {
            signal.addEventListener(
                "abort",
                (ev) => {
                    const err = abortReasonToAuthError(signal.reason);
                    envelopeAbort.discard(err);
                },
                { once: true },
            );
        }

        const challengeRepeatedly = async () => {
            let response;
            try {
                /// Platform Specific -->
                response = await Promise.race([Alier.fetch(request), envelopeAbort]);
                /// <-- Platform Specific
            } catch (err) {
                // retry to fetch challenge
                if (!envelopeAbort.done && this.#challengeInterval > 0) {
                    const msg = err instanceof Error ? err.toString() : err;
                    try {
                        await this.#waitInterval(signal);
                    } finally {
                        if (!envelopeAbort.done) {
                            envelopeAbort.post();
                        }
                    }
                    return await challengeRepeatedly();
                }
                throw err;
            }

            if (this.#challengeInterval === 0) {
                return response;
            }

            if (response.status === 401) {
                return response;
            } else {
                await this.#waitInterval(signal);
                return await challengeRepeatedly();
            }
        };

        let response;
        try {
            response = await challengeRepeatedly();
        } catch (err) {
            if (err instanceof AuthError) {
                throw err;
            }
            if (err instanceof Error) {
                if (err.name === "AbortError") {
                    throw new AbortAuthError(err.message, { cause: err });
                }
                if (err.name === "TimeoutError") {
                    throw new TimeoutAuthError(err.message, { cause: err });
                }
                const code = Object.hasOwn(err, "code")
                    ? err.code
                    : "ERR_DIGEST_CHALL_FETCH";
                throw new AuthError(err.message, code, { cause: err });
            }
            throw new AuthError(err, "ERR_DIGEST_CHALL_FETCH");
        } finally {
            if (!envelopeAbort.done) {
                envelopeAbort.post();
            }
        }

        if (response == null) {
            return;
        }

        const authHeader = response.headers.get("www-authenticate");
        if (authHeader == null) {
            let errMsg = `Challenge response must have WWW-Authenticate header. status: ${response.status}`;
            let body;
            const contentType = response.headers.get("content-type");
            if (contentType === "application/json") {
                body = JSON.stringify(await response.json());
            } else if (contentType === "text/plain") {
                body = await response.text();
            }
            if (body != null) {
                errMsg += `, body: ${body}`;
            }
            throw new AuthError(errMsg, "ERR_DIGEST_CHALL_HEADER");
        }

        const challenge = this.#authenticateHeaderToChallenge(authHeader);

        return challenge;
    }

    /**
     * Async wait for interval with AbortSignal
     * @param {AbortSignal} [signal]
     */
    async #waitInterval(signal) {
        await new Promise((resolve, reject) => {
            if (signal?.aborted) {
                reject(signal.reason);
            }
            let resolved = false;
            const timeout = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    resolve();
                }
            }, this.#challengeInterval);
            signal?.addEventListener(
                "abort",
                (ev) => {
                    if (!resolved) {
                        resolved = true;
                        clearTimeout(timeout);
                        reject(signal.reason);
                    }
                },
                { once: true },
            );
        });
    }

    /**
     * @typedef {"ERR_DIGEST_PARSE_HEADER"|ErrCodeChallengeParam} ErrCodeChallengeParse
     */

    /**
     * @param {string} header www-authentication header field
     * @returns {DigestChallengeParameters}
     * @throws {AuthError<ErrCodeChallengeParse>}
     */
    #authenticateHeaderToChallenge(header) {
        // parse www-authenticate
        let parsedHeaders;
        try {
            parsedHeaders = parseAuthenticateHeader(header);
        } catch (err) {
            throw new AuthError(err.message, "ERR_DIGEST_PARSE_HEADER");
        }
        // Filter by scheme
        const filteredHeaders = parsedHeaders.filter(
            (value) =>
                value.scheme.toLowerCase() === DigestProtocol.scheme.toLowerCase(),
        );
        if (filteredHeaders.length !== 1) {
            throw new AuthError(
                "This scheme is not supported by the endpoint",
                "ERR_DIGEST_PARSE_HEADER",
            );
        }
        const params = filteredHeaders[0].parameters;
        const challenge = this.#validateChallengeParams(params);
        return challenge;
    }

    /**
     * @typedef {"ERR_DIGEST_INVALID_CHALL_PARAM"} ErrCodeChallengeParam
     */

    /**
     * @param {{ [x: string]: string }} params
     * @returns {DigestChallengeParameters}
     * @throws {AuthError<ErrCodeChallengeParam>}
     */
    #validateChallengeParams(params) {
        const errCode = "ERR_DIGEST_INVALID_CHALL_PARAM";

        const challenge = {};

        // realm, optional string
        if (Object.hasOwn(params, "realm")) {
            challenge.realm = params.realm;
        }

        // domain, optional Array of strings
        if (Object.hasOwn(params, "domain")) {
            challenge.domain = params.domain.split(" ");
        }

        // nonce, string
        if (!Object.hasOwn(params, "nonce")) {
            throw new AuthError("Digest challenge must have nonce", errCode);
        }
        challenge.nonce = params.nonce;

        // opaque, string
        if (!Object.hasOwn(params, "opaque")) {
            throw new AuthError("Digest challenge must have opaque", errCode);
        }
        challenge.opaque = params.opaque;

        // stale, "true" or "false"
        if (Object.hasOwn(params, "stale")) {
            challenge.stale = params.stale === "true" ? true : false;
        }

        // algorithm, optional "MD5", "SHA-256", "SHA-512-256" or "{base}-sess", defaults to "MD5"
        if (Object.hasOwn(params, "algorithm")) {
            switch (params.algorithm) {
                case "MD5":
                case "SHA-256":
                case "SHA-512-256":
                case "MD5-sess":
                case "SHA-256-sess":
                case "SHA-512-256-sess":
                    challenge.algorithm = params.algorithm;
                    break;
                default:
                    throw new AuthError(
                        "Digest challenge algorithm must be MD5, SHA-256, SHA-512-256 or *-sess",
                        errCode,
                    );
            }
        } else {
            challenge.algorithm = "MD5";
        }

        // qop, Array of "auth" or "auth-int"
        if (!Object.hasOwn(params, "qop")) {
            throw new AuthError("Digest challenge must have qop", errCode);
        }
        challenge.qop = params.qop.split(" ");
        for (const item of challenge.qop) {
            if (item !== "auth" && item !== "auth-int") {
                throw new AuthError(
                    "Digest challenge qop must be 'auth' or 'auth-int'",
                    errCode,
                );
            }
        }

        // charset, optional "UTF-8"
        if (Object.hasOwn(params, "charset")) {
            if (params.charset.toLowerCase() !== "utf-8") {
                throw new AuthError("Digest challenge charset must be 'UTF-8'", errCode);
            }
            challenge.charset = params.charset;
        }

        // userhash, optional "true" or "false"
        if (Object.hasOwn(params, "userhash")) {
            challenge.userhash = params.userhash === "true" ? true : false;
        }

        return challenge;
    }

    /**
     * @typedef {(
     *      "ABORT" |
     *      "TIMEOUT" |
     *      "ERR_DIGEST_VALID_UNAUTH" |
     *      "ERR_DIGEST_VALID_UNAUTH_CHALL" |
     *      "ERR_DIGEST_VALID_FETCH"
     *      "ERR_DIGEST_VALID_UNKNOWN"
     * )} ErrCodeValid
     */

    /**
     * @async
     * @param {string} url
     * @param {IAuthKey} key
     * @param {object} [options]
     * @param {AbortSignal} [options.signal]
     * @returns {Promise<{any}>}
     * @throws {AuthError<ErrCodeValid|ErrCodeChallengeParse>}
     */
    async #validateAuthorization(url, key, options) {
        const { signal } = options ?? {};

        const method = this.endpoint.method;
        const authorization = await key.toAuthorizationField({ url, method });
        if (signal != null && signal.aborted) {
            const err = abortReasonToAuthError(signal.reason);
            throw err;
        }

        const headers = new Headers({ authorization });
        const request = new Request(url, { method, headers });

        // abort from application or timeout
        const signals = [];
        if (signal) {
            signals.push(signal);
        }
        if (this.#challengeTimeoutDelay > 0) {
            signals.push(AbortSignal.timeout(this.#challengeTimeoutDelay));
        }
        const envelopeAbort = new Envelope();
        if (signals.length > 0) {
            // Polyfill for AbortSignal.any
            if (AbortSignal.any === undefined) {
                Object.defineProperty(AbortSignal, "any", {
                    /**
                     * @param {Iterable<AbortSignal>} iterable
                     * @returns {AbortSignal}
                     */
                    value: function any(iterable) {
                        if (
                            iterable == null ||
                            typeof iterable[Symbol.iterator] !== "function" ||
                            ![...iterable].every((value) => value instanceof AbortSignal)
                        ) {
                            throw new TypeError("It is not iterable with AbortSignal");
                        }
                        const controller = new AbortController();
                        /** @type {Set<AbortSignal>} */
                        const signals = new Set();
                        /**
                         * @this AbortSignal
                         * @param {Event} ev
                         */
                        function listener(ev) {
                            if (!controller.signal.aborted) {
                                controller.abort(this.reason);
                            }
                        }
                        for (const signal of iterable) {
                            if (signal.aborted) {
                                controller.abort(signal.reason);
                                for (const s of signals) {
                                    s.removeEventListener("abort", listener);
                                }
                                break;
                            }
                            signal.addEventListener("abort", listener, { once: true });
                            signals.add(signal);
                        }
                        return controller.signal;
                    },
                });
            }
            const aggregatedSignal = AbortSignal.any(signals);
            aggregatedSignal.addEventListener(
                "abort",
                (ev) => {
                    if (!envelopeAbort.done) {
                        const error = abortReasonToAuthError(aggregatedSignal.reason);
                        envelopeAbort.discard(error);
                    }
                },
                { once: true },
            );
        }

        // fetch result of validation
        let response;
        try {
            // no value with resolved abortPromise
            /// Platform Specific -->
            response = await Promise.race([Alier.fetch(request), envelopeAbort]);
            /// <-- Platform Specific
        } catch (err) {
            if (err instanceof AuthError) {
                throw err;
            }
            if (err.name === "TimeoutError") {
                throw new TimeoutAuthError(err.message, { cause: err });
            }
            if (err instanceof Error) {
                const code = Object.hasOwn(err, "code")
                    ? err.code
                    : "ERR_DIGEST_VALID_FETCH";
                throw new AuthError(err.message, code, { cause: err });
            }
            throw new AuthError(err, "ERR_DIGEST_VALID_FETCH");
        } finally {
            if (!envelopeAbort.done) {
                envelopeAbort.post();
            }
        }

        const ok = response.status === 200;
        if (!ok) {
            switch (response.status) {
                case 401: {
                    const authHeader = response.headers.get("www-authenticate");
                    if (authHeader == null) {
                        const code = "ERR_DIGEST_VALID_UNAUTH_CHALL";
                        const message = "Unauthorized and no challenge by validation.";
                        throw new AuthError(message, code);
                    }
                    let newChallenge;
                    try {
                        newChallenge = this.#authenticateHeaderToChallenge(authHeader);
                    } catch (err) {
                        if (err instanceof AuthError) {
                            throw err;
                        }
                        const code = "ERR_DIGEST_VALID_UNAUTH_CHALL";
                        const message =
                            "Failed to get challenge from unauthorized by validation.";
                        throw new AuthError(message, code, { cause: err });
                    }
                    const code = "ERR_DIGEST_VALID_UNAUTH";
                    const message = "Unauthorized by validation.";
                    throw new AuthError(message, code, {
                        info: { challenge: newChallenge },
                    });
                }
                default: {
                    const code = "ERR_DIGEST_VALID_UNKNOWN";
                    const message = `Unknown error response by validation. status: ${response.status}`;
                    throw new AuthError(message, code);
                }
            }
        }

        let body;
        const contentType = response.headers.get("content-type");
        if (contentType === "application/json") {
            body = await response.json();
        } else if (contentType === "text/plain") {
            body = await response.text();
        }

        return body;
    }
}

/**
 * Parse the header parameters. It will be WWW-Authenticate field.
 * @param {string} header The received WWW-Authenticate header to parse.
 * @returns {{ scheme: string, parameters: object }[]}
 * The parameters object in the header for each scheme.
 */
function parseAuthenticateHeader(header) {
    const reSplitChallenges =
        /[\w-]+(\s("[\w\-.~+/]+=*"|[\w-]+=("([^"\\]|\\.)+"|[^,"]+)),?)*(?=$|,)/g;
    const reParseChallenge =
        /(?<scheme>[\w-]+)(?<params>(?:\s(?:"[\w\-.~+/]+=*"|[\w-]+=(?:"(?:[^"\\]|\\.)+"|[^,"]+)),?)*)(?=$|,)/;
    const reSplitParams =
        /\b("[\w\-.~+/]+=*"|[\w-]+=(?:"(?:[^"\\]|\\.)+"|[^,"]+))(?=,|$)/g;
    const reParseParam =
        /(?<token68>"[\w\-.~+/]+=*")|(?<key>[\w-]+)=(?:"(?<quotedValue>(?:[^"\\]|\\.)+)"|(?<noQuotedValue>[^,"]+))/;

    const headerFields = [];
    for (const challenge of header.match(reSplitChallenges)) {
        const parameters = {};

        const parsedChallenge = reParseChallenge.exec(challenge);
        const scheme = parsedChallenge.groups?.scheme;
        if (scheme == null) {
            throw new Error("Failed to capture scheme");
        }

        for (const param of challenge.match(reSplitParams)) {
            const parsedParam = reParseParam.exec(param);
            const token68 = parsedParam.groups?.token68;
            if (token68 != null) {
                parameters.token68 = token68.replaceAll('\\"', '"');
            } else {
                const key = parsedParam.groups?.key;
                if (key == null) {
                    throw new Error("No authenticate header parameter key");
                }
                const quoted = parsedParam.groups?.quotedValue;
                const noquote = parsedParam.groups?.noQuotedValue;
                let value;
                if (quoted != null) {
                    value = quoted.replaceAll('\\"', '"');
                } else if (noquote != null) {
                    value = noquote;
                } else {
                    throw new Error("No authenticate header parameter value");
                }
                parameters[key] = value;
            }
        }

        headerFields.push({ scheme, parameters });
    }
    return headerFields;
}

function makeRandomASCII(length) {
    const ascii_max = 126;
    const ascii_min = 32;

    const array = new Uint32Array(length);
    window.crypto.getRandomValues(array);
    const asciiCodeArray = array.map(
        (value) => (value % (ascii_max - ascii_min + 1)) + ascii_min,
    );
    const ascii_string = String.fromCharCode(...asciiCodeArray);

    return ascii_string;
}

function makeRandomBase64(length) {
    const array = new Uint8Array(length);
    window.crypto.getRandomValues(array);
    const binaryString = String.fromCharCode(...array);
    const encoded = window.btoa(binaryString);
    return encoded;
}

function buf2hex(buffer) {
    return [...new Uint8Array(buffer)]
        .map((x) => x.toString(16).padStart(2, "0"))
        .join("");
}

function abortReasonToAuthError(reason) {
    let error;
    if (reason instanceof AuthError) {
        error = reason;
    } else if (reason instanceof Error) {
        if (reason.name === "AbortError") {
            error = new AbortAuthError(reason.message, { cause: reason });
        } else if (reason.name === "TimeoutError") {
            error = new TimeoutAuthError(reason.message, { cause: reason });
        } else if (Object.hasOwn(reason, "code")) {
            error = new AuthError(reason.message, reason.code, {
                cause: reason,
            });
        } else {
            error = new AbortAuthError(reason.message, { cause: reason });
        }
    } else if (typeof reason === "string") {
        error = new AbortAuthError(reason);
    } else {
        error = new AbortAuthError("Reason for not identifying");
    }
    return error;
}

/// Platform Specific -->
export {
    AuthError,
    IAuthKey,
    AuthEntity,
    IAuthProtocol,
    IAuthRepository,
    IAuthAgent,
    AgentRepository,
    AuthAgent,
    DigestAuthKey,
    DigestProtocol,
};
