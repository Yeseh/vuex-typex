import { expect } from "chai";
import Vue from "vue";
import * as Vuex from "vuex";
import { getStoreBuilder, StoreBuilder } from "../index";

interface RootState { name: string }

describe("Create a store", () =>
{
    let storeBuilder: StoreBuilder<RootState>
    beforeEach(() =>
    {
        Vue.use(Vuex)
        storeBuilder = getStoreBuilder<RootState>("root")
        storeBuilder.reset()
    })

    describe("that has no modules (root-only)", () =>
    {
        it("should access root state value", () =>
        {
            const stateReader = storeBuilder.state()
            const store = storeBuilder.vuexStore({
                state: { name: "david" }
            })
            expect(stateReader().name).to.equal("david")
        })

        it("should support getters", () =>
        {
            const uppercaseName = (state: RootState) => state.name.toUpperCase()
            const uppercaseNameGetter = storeBuilder.read(uppercaseName)
            const store = storeBuilder.vuexStore({
                state: { name: "david" }
            })
            expect(uppercaseNameGetter()).to.equal("DAVID")
        })
        it("should add multiple getters", () => {
            const split = (state: RootState) => state.name.split('a')[0]
            const lowercaseName = (state: RootState) => state.name.toLowerCase()
            const getters = storeBuilder.createGetters({split, lowercaseName})
            const store = storeBuilder.vuexStore({
                state: { name: "david" }
            })
        })
    })
})