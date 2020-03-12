
import { ActionTree, GetterTree, Module, ModuleTree, MutationTree, Plugin, Store, StoreOptions } from "vuex";

const useRootNamespace = { root: true }

export type MutationHandler<S, P> = (state: S, payload: P) => void
export type ActionHandler<S, R, G, P, T> = (context: BareActionContext<S, R, G>, payload: P) => Promise<T> | T
export type GetterHandler<S, R, G, T> = (state: S, getters: G, rootState: R) => T

export interface GetterHandlerTree<S, R, G, T> {
    [key: string]: GetterHandler<S, R, G, T>;
}
export interface ActionHandlerTree<S, R, G, P, T> {
    [key: string]: ActionHandler<S, R, G, P | void, T | void>
}
export interface MutationHandlerTree<S, P> {
    [key: string]: MutationHandler<S, P | void>
}


export interface StoreAccessors<S, R, G, P, T> {
    getters: GetterHandlerTree<S, R, G, T>;
    mutations: MutationHandlerTree<S, P | void>;
    actions: ActionHandlerTree<S, R, G, P | void, T | void>;
}

interface AccessorCreationOptions {
    prefix?: boolean;
    autoname: boolean;
}

interface Dictionary<T> { [key: string]: T }
interface RootStore<R> extends Store<R> { rootGetters?: any }

export interface BareActionContext<S, R, G=any>
{
    state: S
    rootState: R
    getters: G
}

class ModuleBuilderImpl<S, R={}, G=any> implements ModuleBuilder<S, R> {
    protected _store: RootStore<R> | undefined

    protected _getters: GetterTree<S, R> = {}
    protected _mutations: MutationTree<S> = {}
    protected _actions: ActionTree<S, R> = {}
    protected _moduleBuilders: Dictionary<ModuleBuilder<any, R>> = {}

    protected _vuexModule: Module<S, R> | undefined

    constructor(public readonly namespace: string, private _initialState: S | null) { }

    state(): () => S
    {
        if (!this.namespace)
        {
            return () => <any>this._store!.state as S
        }
        else if (this.namespace.indexOf("/") < 0)
        {
            return () => (<any>this._store!.state)[this.namespace] as S
        }
        else
        {
            const namespaces = this.namespace.split("/")
            return () =>
            {
                let accessor: any = this._store!.state
                for (const name of namespaces)
                {
                    accessor = accessor[name]
                }
                return (<any>accessor) as S
            }
        }
    }

    setInitialState(initialState: S): void
    {
        this._initialState = initialState
    }

    module<M>(namespace: string, initialState: M): ModuleBuilder<M, R>
    module<M>(namespace: string): ModuleBuilder<M, R>
    module<M>(namespace: string, initialState?: M): ModuleBuilder<M, R>
    {
        const existingModule = this._moduleBuilders[namespace]
        const qualifiedNamespace = qualifyNamespace(this.namespace, namespace)
        if (!initialState && existingModule)
        {
            return existingModule
        }

        // both arguments: create a module        
        if (existingModule && initialState)
        {
            existingModule.setInitialState(initialState)
            return existingModule
        }

        const nestedBuilder = new ModuleBuilderImpl<M, R>(qualifiedNamespace, initialState || null)
        this._moduleBuilders[namespace] = nestedBuilder
        return nestedBuilder
    }

    commit<P>(handler: MutationHandler<S, void>): () => void
    commit<P>(handler: MutationHandler<S, P>): (payload: P) => void
    commit<P>(handler: MutationHandler<S, void>, name: string): () => void
    commit<P>(handler: MutationHandler<S, P>, name: string): (payload: P) => void
    commit<P>(handler: MutationHandler<S, P>, name?: string)
    {
        const { key, namespacedKey } = qualifyKey(handler, this.namespace, name)
        if (this._mutations[key])
        {
            throw new Error(`There is already a mutation named ${key}.`)
        }
        this._mutations[key] = handler
        return ((payload: P) => this._store!.commit(namespacedKey, payload, useRootNamespace)) as any
    }

    dispatch<P, T>(handler: ActionHandler<S, R, G, void, void>): () => Promise<void>
    dispatch<P, T>(handler: ActionHandler<S, R, G, P, void>): (payload: P) => Promise<void>
    dispatch<P, T>(handler: ActionHandler<S, R, G, void, T>): () => Promise<T>
    dispatch<P, T>(handler: ActionHandler<S, R, G, P, T>): (payload: P) => Promise<T>
    dispatch<P, T>(handler: ActionHandler<S, R, G, void, void>, name: string): () => Promise<void>
    dispatch<P, T>(handler: ActionHandler<S, R, G, P, void>, name: string): (payload: P) => Promise<void>
    dispatch<P, T>(handler: ActionHandler<S, R, G, void, T>, name: string): () => Promise<T>
    dispatch<P, T>(handler: ActionHandler<S, R, G, P, T>, name: string): (payload: P) => Promise<T>
    dispatch<P, T>(handler: any, name?: string): any
    {
        const { key, namespacedKey } = qualifyKey(handler, this.namespace, name)
        if (this._actions[key])
        {
            throw new Error(`There is already an action named ${key}.`)
        }
        this._actions[key] = handler
        return (payload: P) => this._store!.dispatch(namespacedKey, payload, useRootNamespace)
    }

    read<T>(handler: GetterHandler<S, R, G, T>): () => T
    read<T>(handler: GetterHandler<S, R, G, T>, name: string): () => T
    read<T>(handler: GetterHandler<S, R, G, T>, name?: string): () => T
    {
        const { key, namespacedKey } = qualifyKey(handler, this.namespace, name)
        if (this._getters[key])
        {
            throw new Error(`There is already a getter named ${key}.`)
        }
        this._getters[key] = handler
        return () =>
        {
            if (this._store!.rootGetters)
            {
                return this._store!.rootGetters[namespacedKey] as T
            }
            return this._store!.getters[namespacedKey] as T
        }
    }

    createGetters<T>(handlerTree: GetterHandlerTree<S, R, G, T>): GetterHandlerTree<S, R, G ,T>
    createGetters<T>(handlerTree: GetterHandlerTree<S, R, G, T>, opts: AccessorCreationOptions): GetterHandlerTree<S, R, G ,T>
    createGetters<T>(handlerTree: GetterHandlerTree<S, R, G, T>, opts?: AccessorCreationOptions): GetterHandlerTree<S, R, G ,T>
    {
        const getterTree: GetterHandlerTree<S, R, G, T> = {}

        for(let [name, handler] of Object.entries(handlerTree))
        {
            if(opts && opts.prefix) name = `g_${name}`

            if(opts && opts.autoname)
            { 
                getterTree[name] = this.read(handler, name)
            }
            else 
            { 
                getterTree[name] = this.read(handler) 
            }
        }

        return getterTree;
    }

    createMutations<P>(handlerTree: MutationHandlerTree<S, P>): MutationHandlerTree<S, P>
    createMutations<P>(handlerTree: MutationHandlerTree<S, P | void>, opts: AccessorCreationOptions): MutationHandlerTree<S, P | void>
    createMutations<P>(handlerTree: MutationHandlerTree<S, P | void>, opts?: AccessorCreationOptions): MutationHandlerTree<S, P | void>
    {
        const mutationTree: MutationHandlerTree<S, P | void> = {}
        for(let [name, handler] of Object.entries(handlerTree))
        {
            if(opts && opts.prefix) name = `m_${name}`

            if (opts && opts.autoname) 
            {
                mutationTree[name] = this.commit(handler, name)
            }
            else
            {
                mutationTree[name] = this.commit(handler)
            } 
        }

        return mutationTree
    }

    createActions<P, T>(handlerTree: ActionHandlerTree<S, R, G, void, void>): ActionHandlerTree<S, R, G, P | void, T | void>
    createActions<P, T>(handlerTree: ActionHandlerTree<S, R, G, P | void, T | void>):  ActionHandlerTree<S, R, G, P | void, T | void>
    createActions<P, T>(handlerTree: ActionHandlerTree<S, R, G, P | void, T | void>, opts: AccessorCreationOptions):  ActionHandlerTree<S, R, G, P | void, T | void>
    createActions<P, T>(handlerTree: ActionHandlerTree<S, R, G, P | void, T | void>, opts?: AccessorCreationOptions):  ActionHandlerTree<S, R, G, P | void, T | void>
    {
        const actionTree: ActionHandlerTree<S, R, G, P | void, T | void> = {}

        for(let[name, handler] of Object.entries(handlerTree))
        {
            if(opts && opts.prefix) name = `a_${name}`

            if(opts && opts.autoname)
            {                
                actionTree[name] = this.dispatch(handler, name)
            } 
            else 
            {
                actionTree[name] = this.dispatch(handler)
            }
            
        }

        return actionTree
    }

    createAccessors<P, T>(accessors: StoreAccessors<S, R, G, P | void, T| void>): StoreAccessors<S, R, G, P | void, T | void>
    createAccessors<P, T>(accessors: StoreAccessors<S, R, G, P | void, T| void>, opts: AccessorCreationOptions): StoreAccessors<S, R, G, P | void, T | void>
    createAccessors<P, T>(accessors: StoreAccessors<S, R, G, P | void, T| void>, opts?: AccessorCreationOptions): StoreAccessors<S, R, G, P | void, T | void>
    {
        let defaultOptions: AccessorCreationOptions = {
            autoname: false,
            prefix: false
        }
        const getters = this.createGetters(accessors.getters, opts || defaultOptions),
        actions = this.createActions(accessors.actions, opts || defaultOptions),
        mutations = this.createMutations(accessors.mutations, opts || defaultOptions)

        return {getters, actions, mutations}
        
    }


    vuexModule(): Module<S, R>
    {
        if (!this._vuexModule)
        {
            // build nested modules recursively, if any
            const modules: ModuleTree<R> = {}
            for (const namespace of Object.keys(this._moduleBuilders))
            {
                modules[namespace] = this._moduleBuilders[namespace].vuexModule()
            }

            this._vuexModule = {
                namespaced: true,
                state: this._initialState || <S>{},
                getters: this._getters,
                mutations: this._mutations,
                actions: this._actions,
                modules
            }
        }
        return this._vuexModule
    }

    _provideStore(store: Store<R>)
    {
        this._store = store

        forEachValue(this._moduleBuilders, m => m._provideStore(store))
    }
}

function qualifyKey(handler: Function, namespace: string | undefined, name?: string): { key: string, namespacedKey: string }
{
    const key: string = name || handler.name
    if (!key)
    {
        throw new Error(`Vuex handler functions must not be anonymous. Possible causes: fat-arrow functions, uglify.  To fix, pass a unique name as a second parameter after your callback.`)
    }
    return { key, namespacedKey: qualifyNamespace(namespace, key) }
}

function qualifyNamespace(namespace: string | undefined, key: string)
{
    return namespace ? `${namespace}/${key}` : key
}

export interface ModuleBuilder<S, R={}, G=any>
{
    /** The namespace of this ModuleBuilder */
    readonly namespace: string

    /** Creates a strongly-typed nested module within this module */
    module<M>(namespace: string, initialState: M): ModuleBuilder<M, R>

    /** Gets an existing nested module within this module */
    module<M>(namespace: string): ModuleBuilder<M, R>

    /** Set the initial state for an existing module */
    setInitialState(initialState: S): void

    /** Creates a strongly-typed commit function for the provided mutation handler */
    commit<P>(handler: MutationHandler<S, void>): () => void
    commit<P>(handler: MutationHandler<S, P>): (payload: P) => void
    commit<P>(handler: MutationHandler<S, void>, name: string): () => void
    commit<P>(handler: MutationHandler<S, P>, name: string): (payload: P) => void

    /** Creates a strongly-typed dispatch function for the provided action handler */
    dispatch<P, T>(handler: ActionHandler<S, R, G, void, void>): () => Promise<void>
    dispatch<P, T>(handler: ActionHandler<S, R, G, P, void>): (payload: P) => Promise<void>
    dispatch<P, T>(handler: ActionHandler<S, R, G, void, T>): () => Promise<T>
    dispatch<P, T>(handler: ActionHandler<S, R, G, P, T>): (payload: P) => Promise<T>
    dispatch<P, T>(handler: ActionHandler<S, R, G, void, void>, name: string): () => Promise<void>
    dispatch<P, T>(handler: ActionHandler<S, R, G, P, void>, name: string): (payload: P) => Promise<void>
    dispatch<P, T>(handler: ActionHandler<S, R, G, void, T>, name: string): () => Promise<T>
    dispatch<P, T>(handler: ActionHandler<S, R, G, P, T>, name: string): (payload: P) => Promise<T>

    /** Creates a strongly-typed read function for the provided getter function */
    read<T>(handler: GetterHandler<S, R, G, T>): () => T
    read<T>(handler: GetterHandler<S, R, G, T>, name: string): () => T

    /** Takes multiple handlers at once and creturns a strongly-typed getter tree */
    createGetters<T>(handlerTree: GetterHandlerTree<S, R, G, T>): GetterHandlerTree<S, R, G | void, T | void>

    /** Takes multiple handlers at once and returns a strongly-typed mutation tree */
    createMutations<P>(handlerTree: MutationHandlerTree<S, P>): MutationHandlerTree<S, P | void>

    /** Takes multiple handlers at once and returns a strongly-typed mutation tree */
    createActions<P, T>(handlerTree: ActionHandlerTree<S, R, G, P | void, T | void>): ActionHandlerTree<S, R, G, P | void, T | void>

    /** Takes handler trees for getters, mutations and actions at once and returns strongly-typed  store accessors */
    createAccessors<P, T>(accessors: StoreAccessors<S, R, G, P | void, T | void>): StoreAccessors<S, R, G, P | void, T | void>
    


    /** Creates a method to return this module's state */
    state(): () => S

    /** Output a Vuex Module definition. Called after all strongly-typed functions have been obtained */
    vuexModule(): Module<S, R>

    _provideStore(store: Store<R>): void
}

class StoreBuilderImpl<R> extends ModuleBuilderImpl<any, R> {
    constructor()
    {
        super("", {})
    }

    module<S>(namespace: string, initialState: S): ModuleBuilder<S, R>
    module<S>(namespace: string): ModuleBuilder<S, R>
    module<S>(namespace: string, initialState?: S): ModuleBuilder<S, R>
    {
        return super.module(namespace, initialState) as ModuleBuilder<S, R>
    }

    vuexStore(): Store<R>
    vuexStore(overrideOptions: StoreOptions<R>): Store<R>
    vuexStore(overrideOptions: StoreOptions<R> = {}): Store<R>
    {
        if (!this._store)
        {
            const options: StoreOptions<R> & { namespaced?: boolean } = {
                ...this.vuexModule(),
                ...overrideOptions
            }
            const store = new Store<R>(options)
            forEachValue(this._moduleBuilders, m => m._provideStore(store))
            this._store = store
        }
        return this._store
    }

    registerModule(namespace: string): void
    {
        if (this._store && this._vuexModule) {
            const mBuilder = this._moduleBuilders[namespace]
            if (!mBuilder) throw 'fail to register module: ' + namespace
            mBuilder._provideStore(this._store)

            const vModule = mBuilder.vuexModule()
            this._store.registerModule(namespace, vModule)

            this._vuexModule.modules![namespace] = vModule
        } else {
            throw 'vuexStore hasn\'t been called yet, use module() instead.'
        }
    }

    reset()
    {
        this._store = undefined
        this._moduleBuilders = {}
    }
}

const forEachValue = <T>(dict: Dictionary<T>, loop: (value: T) => any) =>
{
    Object.keys(dict).forEach(key => loop(dict[key]))
}

export interface VuexStoreOptions<R>
{
    plugins?: Plugin<R>[]
}

export interface StoreBuilder<R>
{
    /** Creates a ModuleBuilder for the namespace provided */
    module<S>(namespace: string, state: S): ModuleBuilder<S, R>

    /** Gets an existing ModuleBuilder for the namespace provided */
    module<S>(namespace: string): ModuleBuilder<S, R>

    /** Output a Vuex Store after all modules have been built */
    vuexStore(): Store<R>

    /** Output a Vuex Store and provide options, e.g. plugins -- these take precedence over any auto-generated options */
    vuexStore(overrideOptions: StoreOptions<R>): Store<R>

    /** Creates a strongly-typed commit function for the provided mutation handler */
    commit<P>(handler: MutationHandler<R, void>): () => void
    commit<P>(handler: MutationHandler<R, P>): (payload: P) => void
    commit<P>(handler: MutationHandler<R, void>, name: string): () => void
    commit<P>(handler: MutationHandler<R, P>, name: string): (payload: P) => void

    /** Creates a strongly-typed dispatch function for the provided action handler */
    dispatch<P, T>(handler: ActionHandler<R, R, void, void, void>): () => Promise<void>
    dispatch<P, T>(handler: ActionHandler<R, R, void, P, void>): (payload: P) => Promise<void>
    dispatch<P, T>(handler: ActionHandler<R, R, void, void, T>): () => Promise<T>
    dispatch<P, T>(handler: ActionHandler<R, R, void, P, T>): (payload: P) => Promise<T>
    dispatch<P, T>(handler: ActionHandler<R, R, void, void, void>, name: string): () => Promise<void>
    dispatch<P, T>(handler: ActionHandler<R, R, void, P, void>, name: string): (payload: P) => Promise<void>
    dispatch<P, T>(handler: ActionHandler<R, R, void, void, T>, name: string): () => Promise<T>
    dispatch<P, T>(handler: ActionHandler<R, R, void, P, T>, name: string): (payload: P) => Promise<T>

    /** Creates a strongly-typed read function for the provided getter function */
    read<T>(handler: GetterHandler<R, R, void, T>): () => T
    read<T>(handler: GetterHandler<R, R, void, T>, name: string): () => T

     /** Takes multiple handlers at once and creturns a strongly-typed getter tree */
     createGetters<T>(handlerTree: GetterHandlerTree<R, R, void, T>): GetterHandlerTree<R, R, void , T | void>

     /** Takes multiple handlers at once and returns a strongly-typed mutation tree */
     createMutations<P>(handlerTree: MutationHandlerTree<R, P>): MutationHandlerTree<R, P | void>
 
     /** Takes multiple handlers at once and returns a strongly-typed mutation tree */
     createActions<P, T>(handlerTree: ActionHandlerTree<R, R, void, P | void, T | void>): ActionHandlerTree<R, R, void, P | void, T | void>
 
     /** Takes handler trees for getters, mutations and actions at once and returns strongly-typed  store accessors */
     createAccessors<P, T>(accessors: StoreAccessors<R, R, void, P | void, T | void>): StoreAccessors<R, R, void, P | void, T | void>

    /** Creates a method to return the root state */
    state(): () => R
    
    /** Dynamically register module */
    registerModule(namespace: string): void

    /** WARNING: Discards vuex store and reset modules (non intended for end-user use) */
    reset(): void
}

const storeBuilderSingleton = new StoreBuilderImpl<any>()
const namedStoreBuilderMap: { [name: string]: StoreBuilderImpl<any> } = Object.create(null)

/** Get a reference to the default store builder */
export function getStoreBuilder<R>(): StoreBuilder<R>
/** Get a reference to a named store builder */
export function getStoreBuilder<R>(name: string): StoreBuilder<R>
export function getStoreBuilder<R>(name?: string): StoreBuilder<R>
{
    // the default store builder
    if (!name)
    {
        return storeBuilderSingleton
    }

    // a named store builder    
    const builder = namedStoreBuilderMap[name] || (namedStoreBuilderMap[name] = new StoreBuilderImpl<R>())
    return builder
}
