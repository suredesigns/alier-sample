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

import { sql, DBConnector, DBError, asSqlIdentifier, asSqlValue, asSqlString } from "/alier_sys/_DBConnector.js";

/**
 * @typedef {(
 *      "set-null"    |
 *      "set-default" |
 *      "cascade"     |
 *      "restrict"    |
 *      "no-action"
 * )} ActionType
 * Actions triggered when foreign keys are modified (updated or deleted).
 * 
 * @typedef {({
 *      table: string,
 *      to: string,
 *      onUpdate: ActionType,
 *      onDelete: ActionType
 * })} ForeignKeyType
 * Objects representing descriptions of foreign key references.
 * 
 * @typedef {(ForeignKeyType | ForeignKeyType[]) } InputForeignKeyType
 * Loosely typed version of {@link ForeignKeyType}.
 * 
 * @typedef {({
 *      type: string,
 *      unique: boolean,
 *      nullable: boolean,
 *      defaultValue?: string | number,
 *      foreignKey?: ForeignKeyType
 * })} ColumnDescriptorType
 * Objects representing descriptions of columns of database tables.
 * 
 * @typedef {(string | ColumnDescriptorType | {
 *      type: string,
 *      unique: boolean,
 *      nullable: boolean,
 *      defaultValue?: string | number,
 *      foreignKey?: InputForeignKeyType
 * })} InputColumnDescriptorType
 * Loosely typed version of {@link ColumnDescriptorType}.
 *
 * @typedef {(
 *      "create-index" |
 *      "unique"       |
 *      "primary-key"
 * )} IndexOriginType
 * Origins of database indexes.
 * 
 * @typedef {({
 *      unique: boolean,
 *      origin: IndexOriginType,
 *      partial: boolean
 * })} IndexDescriptorType
 * Objects representing descriptions of database indexes.
 *  
 * @typedef {({
 *      name: string,
 *      primaryKey?: string[],
 *      indexes?: {
 *          [index_name: string]: IndexDescriptorType
 *      },
 *      columns: {
 *          [column_name: string]: ColumnDescriptorType
 *      }
 * })} TableSchemaType
 * Objects representing database table schemata.
 *  
 * @typedef {({
 *      name: string,
 *      primaryKey?    : string | string[],
 *      primarykey?    : string | string[],
 *      primary_key?   : string | string[],
 *      "primary-key"? : string | string[],
 *      indexes?: {
 *          [index_name: string]: IndexDescriptorType
 *      },
 *      columns: {
 *          [column_name: string]: InputColumnDescriptorType
 *      }
 * })} InputTableSchemaType 
 * Loosely typed version of {@link TableSchemaType}.
 */

/**
 * An implementation of {@link DBConnector} for SQLite on Android/iOS.
 */
class SQLiteConnector extends DBConnector {
    /**
     * @type {Map<string, SQLiteConnector>}
     */
    static #instance_repo = new Map();

    /**
     * @constructor
     * Creates a new `SQLiteConnector`.
     * 
     * If there already exists an instance for the same database name,
     * the constructor returns the existing one instead of new one.
     * 
     * @param {object} o 
     * @param {string} o.database
     * A string representing the database name.
     * 
     * @param {number} o.version
     * The database version.
     * 
     * This must be a positive integer (`version >= 1`).
     * 
     * @param {(() => Promise<void>)?} o.onConfigure
     * A callback function invoked when starting to configure the
     * database.
     * 
     * @param {(() => Promise<void>)?} o.onCreate
     * A callback function invoked when creating a new database.
     * 
     * @param {((oldVersion, newVersion) => Promise<void>)?} o.onUpgrade
     * A callback function invoked when upgrading the existing database.
     * 
     * @param {((oldVersion, newVersion) => Promise<void>)?} o.onDowngrade
     * A callback function invoked when downgrading the existing database.
     * 
     * @param {(() => Promise<void>)?} o.onOpen
     * A callback function invoked when opening the database.
     * 
     * @throws {TypeError}
     * When
     * -    `version` is not a number
     * -    `version` is not an integer
     * -    `version` is negative or zero
     * -    `onConfigure` is neither null nor a function
     * -    `onCreate` is neither null nor a function
     * -    `onUpgrade` is neither null nor a function
     * -    `onDowngrade` is neither null nor a function
     * -    `onOpen` is neither null nor a function
     */
    constructor(o) {
        const o_ = o ?? {};
        super(o_);

        const {
            database,
            version,
            onConfigure: on_configure,
            onCreate   : on_create,
            onUpgrade  : on_upgrade,
            onDowngrade: on_downgrade,
            onOpen     : on_open 
        } = o_;

        if (typeof version !== "number") {
            throw new TypeError("'version' must be a number");
        } else if (!Number.isInteger(version)) {
            throw new TypeError(`'version' (${version}) is not an integer`);
        } else if (version <= 0) {
            throw new TypeError(`'version' (${version}) is not a positive integer`);
        } else if (on_configure != null && typeof on_configure !== "function") {
            throw new TypeError("'onConfigure' must be a function");
        } else if (on_create != null && typeof on_create !== "function") {
            throw new TypeError("'onCreate' must be a function");
        } else if (on_upgrade != null && typeof on_upgrade !== "function") {
            throw new TypeError("'onUpgrade' must be a function");
        } else if (on_downgrade != null && typeof on_downgrade !== "function") {
            throw new TypeError("'onDowngrade' must be a function");
        } else if (on_open != null && typeof on_open !== "function") {
            throw new TypeError("'onOpen' must be a function");
        }

        const connector = SQLiteConnector.#instance_repo.get(database);

        if (connector != null) {
            //  use the existing instance instead of the new one.
            return connector;
        }

        //  #available is resolved when the first call of execute().
        let configured;
        let created;
        let upgraded;
        let downgraded;

        const on_configure_ = on_configure == null ? null : async () => {
            configured = on_configure();
        };
        const on_create_    = on_create == null ? null : async () => {
            created = on_create();
        };
        const on_upgrade_   = on_upgrade == null ? null : async () => {
            upgraded = on_upgrade();
        };
        const on_downgrade_ = on_downgrade == null ? null : async () => {
            downgraded = on_downgrade();
        };
        const on_open_      = async () => {
            await Promise.all([ configured, created, upgraded, downgraded ]);

            if (on_open != null) {
                on_open();
            }
        };

        SQLiteConnector.#instance_repo.set(database, this);

        Alier.Native.addDB(
            database,
            version,
            on_configure_,
            on_create_,
            on_upgrade_,
            on_downgrade_,
            on_open_
        );
    }

    /**
     * @async
     * @override
     * 
     * Executes the given SQL statement with binding parameters.
     * 
     * @param {string} statement 
     * @param  {...any} params 
     * A set of optional parameters used in the given statement.
     * 
     * @returns {Promise<{
     *      status: true,
     *      records?: object[],
     * } | {
     *      status: false,
     *      message?: string
     * }>}
     * A `Promise` that resolves to an object describing the execution
     * result.
     */
    async execute(statement, ...params) {
        //  Alier.Native.execSQL() requires an array as
        //  the third argument. This restriction is due to that
        //  the JavaScriptInterface functions cannnot be variadic.
        return Alier.Native.execSQL(this.database, statement, params);
    }

    /**
     * @async
     * @override
     * This function does nothing.
     */
    async end() {
        return this.disconnect();
    }

    /**
     * @async
     * @override
     * 
     * This function does nothing.
     */
    async connect() {
        //  Do nothing here intentionally.
        //  Because the super class implementation throws an error,
        //  this override cannot be erased.
        return true;
    }

    /**
     * @async
     * @override
     * 
     * This function does nothing.
     */
    async disconnect() {
        //  Do nothing here intentionally.
        //  Because the super class implementation throws an error,
        //  this override cannot be erased.
        return;
    }

    /**
     * @async
     * @override
     * 
     * Starts a new transaction.
     * 
     * @param {object} options
     * @param {("immediate" | "exclusive")?} options.mode
     * A string representing transaction mode.
     * 
     * `BEGIN IMMEDIATE TRANSACTION` is used when `"immediate"` is
     * specified.
     * 
     * `BEGIN EXCLUSIVE TRANSACTION` is used when `"exclusive"` is
     * specified.
     * 
     * This parameter is optional.
     * By default, `"exclusive"` is used.
     * 
     * @throws {DBError}
     * When
     * -    on-going transaction exists
     * -    the given transaction mode is unknown
     */
    async startTransaction(options) {
        const mode = String(options?.mode ?? "exclusive");
        try {
            await Alier.Native.startTransaction(this.database, mode);
        } catch(e) {
            throw new DBError(e.message, { cause: e });
        }
    }

    /**
     * @async
     * @override
     * 
     * Commits the database state.
     * 
     * @throws {DBError}
     * When
     * -    there is no on-going transaction
     */
    async commit() {
        try {
            await Alier.Native.commit(this.database);
        } catch(e) {
            throw new DBError(e.message, { cause: e });
        }
    }

    /**
     * @async
     * @override
     * 
     * Rolls back the database state to the beginning of the current
     * transaction.
     * 
     * @throws {DBError}
     * When
     * -    there is no on-going transaction
     */
    async rollback() {
        try {
            await Alier.Native.rollback(this.database);
        } catch(e) {
            throw new DBError(e.message, { cause: e });
        }
    }

    /**
     * @async
     * @override
     * 
     * Rolls back the database state to the specified savepoint.
     * 
     * @param {string} savepoint 
     * A string representing the target savepoint
     * 
     * @throws {DBError}
     * When
     * -    there is no on-going transaction
     */
    async putSavepoint(savepoint) {
        try {
            await Alier.Native.putSavepoint(this.database, savepoint);
        } catch(e) {
            throw new DBError(e.message, { cause: e });
        }
    }

    /**
     * @async
     * @override
     * 
     * Rolls back the database state to the specified savepoint.
     * 
     * @param {string} savepoint 
     * A string representing the target savepoint
     * 
     * @throws {DBError}
     * When
     * -    there is no on-going transaction
     * -    the target savepoint does not exist in the on-going 
     *      transaction
     */
    async rollbackTo(savepoint) {
        try {
            await Alier.Native.rollbackTo(this.database, savepoint);
        } catch(e) {
            throw new DBError(e.message, { cause: e });
        }
    }

    /**
     * @async
     * @override
     * 
     * Creates a new table from the given table schema.
     * 
     * @param {InputTableSchemaType} tableSchema 
     * An object representing the definition of a table to be created.
     * 
     * @param {boolean} ifNotExists 
     * A boolean indicating whether or not to try to create a table
     * if the table with the same name already exists.
     * `true` means that this function tries to create a table
     * only if it does not exist yet.
     * `false` means that this function tries to create a table
     * regardless of its existence.
     * 
     * @returns {Promise<TableSchemaType>}
     * A `Promise` that resolves to an object representing the created
     * table schema.
     * 
     * @throws {DBError}
     * When failed to create a table.
     */
    async createTable(tableSchema, ifNotExists) {
        const if_not_exists = Boolean(ifNotExists);

        const table_schema = tableSchema;
        if (table_schema === null || typeof table_schema !== "object") {
            throw new TypeError("Table schema is not a non-null object");
        }

        const table_name = table_schema?.name;
        if (typeof table_name !== "string") {
            throw new TypeError("Given schema's 'name' property is not a string");
        }

        let primary_key = (
            table_schema.primaryKey     ??
            table_schema.primarykey     ??
            table_schema.primary_key    ??
            table_schema["primary-key"] ??
            []
        );
        if (typeof primary_key === "string") {
            primary_key = primary_key.split(",").map(key => key.trim()).filter(key => key.length > 0);
        }
        const primary_key_ = primary_key;
        if (!Array.isArray(primary_key_) || primary_key_.some(x => typeof x !== "string")) {
            //  Array.prototype.some() always returns false for empty arrays.
            throw new TypeError("Given schema's 'primaryKey' property is not a string array");
        }

        //  To make a copy of the columns object after type checking,
        //  let columns a let variable.
        let columns = table_schema.columns;
        if (columns === null || typeof columns !== "object") {
            throw new TypeError("Given schema's 'columns' property is not a non-null object");
        }

        //  Make a copy of the column descriptor.
        columns = {...columns};

        //  Normalize the given column descriptor.
        for (const column_name of Object.keys(columns)) {
            const column  = columns[column_name];
            if (typeof column === "string") {
                columns[column_name] = { type: column };
            } else {
                columns[column_name] = { ...column };

                const foreign_key = column.foreignKey;
                if (Array.isArray(foreign_key)) {
                    if (foreign_key.length > 0) {
                        column.foreignKey = { ...(foreign_key[0]) };
                    } else {
                        delete column.foreignKey;
                    }
                } else if (foreign_key != null) {
                    column.foreignKey = { ...foreign_key };
                }
            }
        }

        /** @type {{ [column_name: string]: ColumnDescriptorType }} */
        const columns_ = columns;

        const column_specs      = [];
        const table_constraints = [];

        for (const column_name of Object.keys(columns_)) {
            const column = columns_[column_name];

            /** @type {string[]} */
            const column_constraints = [];

            const unique = column.unique ?? false;
            if (unique && !primary_key_.includes(column_name)) {
                //  Because every primary key is implicitly unique,
                //  there is no need for applying UNIQUE constraint to it.

                /// TODO: Consider to support conflict-clause
                column_constraints.push("UNIQUE");
            } 

            const not_null = !(column.nullable ?? true);
            if (not_null) {
                /// TODO: Consider to support conflict-clause
                column_constraints.push("NOT NULL");
            } 

            const default_value = column.defaultValue;
            if (default_value != null) {
                column_constraints.push(`DEFAULT ${this.asValue(default_value)}`)
            }

            const foreign_key = column.foreignKey;
            const map_action = (action) => {
                switch (action) {
                    case "set-null"   : return "SET NULL"   ;
                    case "set-default": return "SET DEFAULT";
                    case "cascade"    : return "CASCADE"    ;
                    case "restrict"   : return "RESTRICT"   ;
                    case "no-action"  : return "NO ACTION"  ;
                }
            };
            if (foreign_key != null) {
                const { table, to, onUpdate: on_update, onDelete: on_delete } = foreign_key;
                if (typeof table !== "string") {
                    throw new TypeError(`Column ${column_name}: Foreign table is not specified`);
                } else if (typeof to !== "string") {
                    throw new TypeError(`Column ${column_name}: Column name of the foreign table (${table}) is not specified`);
                } else if (on_update != null && typeof on_update !== "string") {
                    throw new TypeError(`Column ${column_name}: Unexpected value is set as ON UPDATE action for the foreign key "${table}.${to}"`);
                } else if (on_delete != null && typeof on_delete !== "string") {
                    throw new TypeError(`Column ${column_name}: Unexpected value is set as ON DELETE action for the foreign key "${table}.${to}"`);
                }

                const on_update_ = map_action(on_update ?? "no-action");
                if (on_update_ == null) {
                    throw new TypeError(`Column ${column_name}: Unknown action is set as ON UPDATE action: ${on_update}`);
                }

                const on_delete_ = map_action(on_delete ?? "no-action");
                if (on_delete_ == null) {
                    throw new TypeError(`Column ${column_name}: Unknown action is set as ON DELETE action: ${on_delete}`);
                }

                let fk_cluase = `REFERENCES ${this.asIdentifier(table)}(${this.asIdentifier(to)})`;
                if (on_update_ !== "NO ACTION") {
                    fk_cluase += " " + `ON UPDATE ${on_update_}`;
                }
                if (on_delete_ !== "NO ACTION") {
                    fk_cluase += " " + `ON DELETE ${on_delete_}`;
                }

                column_constraints.push(fk_cluase);
            }
            column_specs.push(
                `${column_name} ${column.type} ${column_constraints.join(" ")}`
            );
        }

        table_constraints.push(`PRIMARY KEY (${primary_key_.map(x => this.asIdentifier(x)).join(",")})`);

        const table_specs    = [...column_specs, ...table_constraints ]; 

        const result = await this.execute(sql`
            ${if_not_exists ? "CREATE TABLE IF NOT EXISTS" : "CREATE TABLE"} ${this.asIdentifier(table_name)} (
            ${table_specs.join(",")}
        );`);

        if (!result.status) {
            throw new DBError(result.message);
        }

        this.schema = await this.getSchema();

        return {
            name: table_name,
            primaryKey: primary_key_,
            columns: columns_
        };
    }

    /**
     * @async
     * @override
     *  
     * Drops the specified table if exists.
     * 
     * @param {string} tableName 
     * A string representing the table to be dropped.
     * 
     * @returns {Promise<void>}
     * A `Promise` settled when the process is completed.
     * 
     * @throws {DBError}
     * When failed to create a table.
     */
    async dropTable(tableName) {
        const table_name = String(tableName);

        const result = await this.execute(sql`
            DROP TABLE IF EXISTS ${this.asIdentifier(table_name)}
        `);

        if (!result.status) {
            throw new DBError(result.message);
        }

        this.schema = await this.getSchema();
    }

    /**
     * @async
     * 
     * Gets a list of existing tables.
     * 
     * @returns {Promise<string[]>}
     * A `Promise` that resolves to an array of strings.
     * Each string represents an existing table name.
     * 
     * @throws {DBError}
     * When failed to get the list of existing tables.
     */
    async getTableList() {
        //  `pragma_table_list` is available in SQLite 3.37.0 or higher and hence
        //  for keeping compatibility with older versions of SQLite, `sqlite_master` is used instead.
        //  Note that `sqlite_master` is now an alias of `sqlite_schema` but the latter was
        //  introduced in SQLite 3.33.0 and hence it may also cause a compatibility issue.

        //  Get table schemata excluding the following tables:
        //  -   android_metadata
        //  -   room_master_table
        //  -   tables whose names start with "sqlite_"
        const table_names = await this.execute(sql`
            SELECT  name
            FROM    sqlite_master
            WHERE   type='table'
            AND     name NOT LIKE 'sqlite_%'
            AND     name NOT IN ('android_metadata', 'room_master_table');
        `);

        if  (!table_names.status) {
            throw new DBError(table_names.message);
        }

        /**
         * @type { ({ name: string })[] }
         */
        const table_names_records = table_names.records ?? [];

        return table_names_records.map(({ name }) => name);
    }

    /**
     * @async
     * Gets information about the specified table.
     * 
     * @param {string} tableName 
     * A string representing the table name.
     * 
     * @returns {Promise<{
     *      primaryKey: string[],
     *      columns: {
     *          [column_name: string]: {
     *              type: string,
     *              nullable: boolean,
     *              defaultValue?: string | number
     *          }
     *      }
     * }>}
     * A `Promise` that resolves to an object describing information
     * about the specified table.
     * 
     * The `primaryKey` property is an array of strings and each string 
     * is a column name which compounds the primary key of 
     * the specified table.
     * The column names are ordered by their rank.
     * 
     * The `columns` property is an object mapping each column name to 
     * the description of the corresponding column.
     * The description consists of `type`, `nullable`, `defaultValue` 
     * properties.
     * The `type` property represents the data type of the column.
     * The `nullable` property represents whether or not the `NOT NULL` 
     * constraint is applied for the column. `true` if not applied, 
     * `false` otherwise.
     * The `defaultValue` property is an optional property which 
     * represents the default value of the column.
     * The default value is used when an inserted or updated record does
     * not have a value for the column.
     *
     * Note that the return value does not contain some detail 
     * information about the database table, such as `UNIQUE` constraint,
     * `CHECK` constraint, and `FOREIGN KEY` constraint.
     * 
     * To obtain information about `UNIQUE` constraint, you can use 
     * combination of {@link getIndexList()} and {@link getIndexInfo()}.
     * You can obtain the names of indexes comming from `UNIQUE` 
     * constraints from the former and the column names associated with
     * the indexes from the latter.
     * 
     * To obtain information about `FOREIGN KEY` constraint,
     * you can use {@link getForeignKeyList()}.
     * 
     * However, `CHECK` constraints cannot be obtained.
     * 
     * @throws {DBError}
     * When failed to get the specified table information.
     * 
     * @see
     * -    {@link https://www.sqlite.org/pragma.html#pragma_table_info}
     */
    async getTableInfo(tableName) {
        const table_name = String(tableName);

        const table_info = await this.execute(sql`
            SELECT * FROM pragma_table_info(${this.asString(table_name)});
        `);

        if (!table_info.status) {
            throw new DBError(table_info.message);
        }

        if (table_info.records == null) {
            return { primaryKey: [], columns: {} };
        }

        /**
         * @type {({
         *     name: string,
         *     type: string,
         *     notnull: number,
         *     dflt_value: string | number | undefined,
         *     pk: number
         * })[]}
         */
        const table_info_records = table_info.records;

        /**
         * @type {([ number, string ])[] }
         */
        const pks = [];
        /**
         * @type {({
         *      [column_name: string]: {
         *          type: string,
         *          nullable: boolean,
         *          defaultValue?: string | number
         *      }
         * })}
         */
        const columns = {};
        for (const { name: column_name, type, notnull, dflt_value, pk } of table_info_records) {
            const col = {
                type,
                nullable: !notnull
            };
            if (dflt_value != null) {
                col.defaultValue = dflt_value;
            }

            columns[column_name] = col;
            if (pk > 0) {
                pks.push([ pk, column_name ]);
            }
        }

        const primary_key = pks
            .sort(([x, ], [y, ]) => (x - y))
            .map(([, column_name ]) => column_name )
        ;

        return {
            primaryKey: primary_key,
            columns
        };
    }

    /**
     * @async
     * 
     * Gets indexes of the specified table.
     * 
     * @param {string} tableName 
     * A string representing the name of the table to inspect.
     * 
     * @returns {Promise<({
     *      [index_name: string]: {
     *          unique: boolean,
     *          origin:
     *              "create-index" |
     *              "unique"       |
     *              "primary-key"
     *          ,
     *          partial: boolean
     *      }
     * })>}
     * 
     * A `Promise` that resolves to an object mapping each index name to
     * information about the corresponding index.
     * 
     * The `unique` property is a `boolean` indicating whether or not
     * the index is created from the `CREATE UNIQUE INDEX` statement.
     * 
     * The `origin` property is a `string` representing the origin of 
     * the index. This property can have either one of `"create-index"` 
     * or `"unique"` or `"primary-key"` as its value.
     * `"create-index"` means that the index is created by
     * the `CREATE INDEX` statement.
     * `"unique"` means that the index is implicitly 
     * created by the `UNIQUE` constraint.
     * `"primary-key"` means that the index is implicitly 
     * created by the `PRIMARY KEY` constraint.
     * 
     * The `partial` property is a `boolean` indicating whether or not
     * the index is partial. "partial" means an index is created over 
     * a subset of the corresponding table which satisfies certain 
     * conditions. i.e. an index created from the `CREATE INDEX` 
     * statement with `WHERE` clause is partial.
     * 
     * @throws {DBError}
     * When failed to get the index list associated with the specified 
     * table.
     * 
     * @see
     * -    {@link https://www.sqlite.org/pragma.html#pragma_index_list}
     */
    async getIndexList(tableName) {
        const table_name = String(tableName);

        const index_list = await this.execute(sql`
            SELECT * FROM pragma_index_list(${this.asString(table_name)});
        `);

        if (!index_list.status) {
            throw new DBError(index_list.message);
        }

        if (index_list.records == null) {
            return {};
        }

        /**
         * @type {({
         *     name: string,
         *     unique: number,
         *     origin: "c" | "u" | "pk",
         *     partial: number
         * })[]}
         */
        const index_list_records = index_list.records;

        /**
         * @type {({
         *      [index_name: string]: {
         *          unique: boolean,
         *          origin: "create-index" | "unique" | "primary-key",
         *          partial: boolean
         *      }
         * })}
         */
        const indexes = {};

        for (const { name: index_name, unique, origin, partial } of index_list_records) {
            indexes[index_name] = {
                unique: Boolean(unique),
                origin: (
                    origin === "c" ?
                        "create-index" :
                    origin === "u" ?
                        "unique" :
                        "primary-key"
                ),
                partial: Boolean(partial)
            };
        }

        return indexes;
    }

    /**
     * @async
     * 
     * Gets information about the specified database index.
     * 
     * @param {string} indexName 
     * A string representing the database index name.
     * 
     * @returns {Promise<({ name: string })[]>}
     * A `Promise` that resolves to an array of objects, each of which
     * has the `name` property representing the column name associated
     * with the specified index.
     * 
     * @throws {DBError}
     * When failed to get information about the specified index.
     * 
     * @see
     * -    {@link https://www.sqlite.org/pragma.html#pragma_index_info}
     */
    async getIndexInfo(indexName) {
        const index_name = String(indexName);

        //  pragma_index_info.name is NULL if the column is rowid or an expression.
        const index_info = await this.execute(sql`
            SELECT  name
            FROM    pragma_index_info(${this.asString(index_name)})
            WHERE   name IS NOT NULL
        `);

        if (!index_info.status) {
            throw new DBError(index_info.message);
        }
        if (index_info.records == null) {
            return [];
        }

        /**
         * @type {({ name: string })[]}
         */
        const index_info_records = index_info.records;

        return index_info_records;
    }

    /**
     * @async
     * 
     * Gets the list of foreign keys associated with the target table.
     * 
     * @param {string} tableName 
     * A string representing the name of the table to inspect.
     * 
     * @returns {Promise<({
     *      [column_name: string]: ({
     *          table: string,
     *          to   : string,
     *          onUpdate:
     *              "set-null"    |
     *              "set-default" |
     *              "cascade"     |
     *              "restrict"    |
     *              "no-action",
     *          onDelete:
     *              "set-null"    |
     *              "set-default" |
     *              "cascade"     |
     *              "restrict"    |
     *              "no-action"
     *      })[]
     * })>}
     * A `Promise` that resolves to an object having information
     * about the foreign keys associated with the target table.
     * 
     * @throws {DBError}
     * When failed to get the lisf of foreign keys associated with
     * the specified table.
     * 
     * @see
     * -    {@link https://www.sqlite.org/pragma.html#pragma_foreign_key_list}
     */
    async getForeignKeyList(tableName) {
        const table_name = String(tableName);

        const foreign_key_list = await this.execute(sql`
            SELECT * FROM pragma_foreign_key_list(${this.asString(table_name)});
        `);


        if (!foreign_key_list.status) {
            throw new DBError(foreign_key_list.message);
        }
        if (foreign_key_list.records == null) {
            return {};
        }

        /**
         * @type {({
         *     seq: number,
         *     table: string,
         *     from: string,
         *     to  : string,
         *     on_update:
         *         "SET NULL"     |
         *         "SET DEFAULT"  |
         *         "CASCADE"      |
         *         "RESTRICT"     |
         *         "NO ACTION",
         *     on_delete:
         *         "SET NULL"     |
         *         "SET DEFAULT"  |
         *         "CASCADE"      |
         *         "RESTRICT"     |
         *         "NO ACTION"
         * })[]}
         */
        const foreign_key_list_records = foreign_key_list.records;

        //  Sort the obtained foreign key list by "from" and "seq".
        foreign_key_list_records.sort((
                { from: x_from, seq: x_seq },
                { from: y_from, seq: y_seq }
        ) => {
            const from_order = -(x_from < y_from) + (x_from > y_from);
            return  from_order + (from_order !== 0) * (-(x_seq < y_seq) + (x_seq > y_seq));
        });

        /**
         * @type {({
         *      [column_name: string]: ({
         *          table: string,
         *          to   : string,
         *          onUpdate:
         *              "set-null"    |
         *              "set-default" |
         *              "cascade"     |
         *              "restrict"    |
         *              "no-action",
         *          onDelete:
         *              "set-null"    |
         *              "set-default" |
         *              "cascade"     |
         *              "restrict"    |
         *              "no-action"
         *      })[]
         * })}
         */
        const foreign_keys = {};
        /**
         * @type {(action:  
         *          "SET NULL"     |
         *          "SET DEFAULT"  |
         *          "CASCADE"      |
         *          "RESTRICT"     |
         *          "NO ACTION"
         *      ) => 
         *          "set-null"    |
         *          "set-default" |
         *          "cascade"     |
         *          "restrict"    |
         *          "no-action"
         * }
         */
        const map_action = (action) => {
            switch (action) {
                case "SET NULL"   : return "set-null";
                case "SET DEFAULT": return "set-default";
                case "CASCADE"    : return "cascade";
                case "RESTRICT"   : return "restrict";
                case "NO ACTION"  : return "no-action";
            }
        };
        for (const { from, table, to, on_update, on_delete } of foreign_key_list_records) {
            const fk = {
                table,
                to,
                onUpdate: map_action(on_update),
                onDelete: map_action(on_delete)
            };

            if (!(from in foreign_keys)) {
                foreign_keys[from] = [];
            }
            foreign_keys[from].push(fk);
        }

        return foreign_keys;
    }

    /**
     * @async
     * @override
     * 
     * Gets the corresponding database schema.
     * 
     * This function updates the `schema` property of the target
     * `SQLiteConnector` when it succeeds to get the schema.
     * 
     * @returns {Promise<{
     *      tables: ({
     *          name: string,
     *          indexes: {
     *              [index_name: string]: {
     *                  unique: boolean,
     *                  origin:
     *                      "create-index" |
     *                      "unique"       |
     *                      "primary-key"  ,
     *                  partial: boolean
     *              }
     *          },
     *          primaryKey: string[],
     *          columns: {
     *              [column_name: string]: {
     *                  type: string,
     *                  unique: boolean,
     *                  nullable: boolean,
     *                  defaultValue?: string | number,
     *                  foreignKey?: ({
     *                      table: string,
     *                      to: string,
     *                  onUpdate:
     *                      "set-null"    |
     *                      "set-default" |
     *                      "cascade"     |
     *                      "restrict"    |
     *                      "no-action"   ,
     *                  onDelete:
     *                      "set-null"    |
     *                      "set-default" |
     *                      "cascade"     |
     *                      "restrict"    |
     *                      "no-action"
     *                  })[]
     *              }
     *          }
     *      })[]
     * }>}
     * 
     * A `Promise` that resolves to an object representing
     * the database schema.
     * 
     * @throws {DBError}
     * When
     * -    failed to get the list of existing tables
     * -    failed to get information about some existing table
     * -    failed to get the list of foreign keys associated with some 
     *      existing table
     * -    failed to get the list of indexes associated with some
     *      existing table
     * -    failed to get information about some existing index
     * 
     * @see
     * -    {@link getTableList}
     * -    {@link getTableInfo}
     * -    {@link getForeignKeyList}
     * -    {@link getIndexList}
     * -    {@link getIndexInfo}
     */
    async getSchema() {
        /**
         * @type { string[] }
         */
        const table_names = await this.getTableList();

        const tables = (await Promise.all(table_names.map(async table_name => {
            const [ table_info, indexes, foreign_keys ] = await Promise.all([
                this.getTableInfo(table_name),
                this.getIndexList(table_name),
                this.getForeignKeyList(table_name)
            ]);
            
            const unique_column_names = new Set((await Promise.all(Object.keys(indexes)
                .filter(index_name => indexes[index_name].origin !== "create-index")
                .map(async index_name => (await this.getIndexInfo(index_name)).map(({ name }) => name))
            )).flat());

            const pk = table_info.primaryKey;
            /**
             * @type {({
             *      [column_name: string]: {
             *          type: string,
             *          unique: boolean,
             *          nullable: boolean,
             *          defaultValue?: string | number,
             *          foreignKey?: ({
             *              table: string,
             *              to: string,
             *          onUpdate:
             *              "set-null"    |
             *              "set-default" |
             *              "cascade"     |
             *              "restrict"    |
             *              "no-action",
             *          onDelete:
             *              "set-null"    |
             *              "set-default" |
             *              "cascade"     |
             *              "restrict"    |
             *              "no-action"
             *          })[]
             *      }
             * })}
             */
            const columns = table_info.columns;
            for (const column_name of Object.keys(columns)) {
                const column = columns[column_name];
                column.unique = unique_column_names.has(column_name);
            }
            for (const column_name of Object.keys(foreign_keys)) {
                const column = columns[column_name];
                if (column != null) {
                    column.foreignKey = foreign_keys[column_name];
                }
            }
            return {
                name: table_name,
                indexes: indexes,
                primaryKey: pk,
                columns: columns
            };
        })));
        
        const schema = { tables };

        this.schema = schema;

        return schema;
    }

    fixPreparedStatementQuery(query) {
        return query;
    }

    asIdentifier(rawIdentifier) {
        return asSqlIdentifier(rawIdentifier);
    }

    asString(rawString) {
        return asSqlString(rawString);
    }

    asValue(rawValue) {
        return asSqlValue(rawValue, { booleanReplacer: (b) => Number(b).toString()});
    }
}

export {
    SQLiteConnector
};
