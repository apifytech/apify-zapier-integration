const Promise = require('bluebird');
const { APIFY_API_ENDPOINTS, DEFAULT_KEY_VALUE_STORE_KEYS } = require('./consts');

/**
 * Get items from dataset. If there are more than limit items,
 * it will attach item with info about reaching limit.
 */
const getDatasetItems = async (z, datasetId, limit) => {
    const itemsResponse = await z.request(`${APIFY_API_ENDPOINTS.datasets}/${datasetId}/items`, {
        params: {
            limit,
            clean: true,
        },
    });

    const totalItemsCount = itemsResponse.getHeader('x-apify-pagination-total');
    const items = JSON.parse(itemsResponse.content); // NOTE: It looks itemsResponse.json, can not work with json array.

    if (totalItemsCount > limit) {
        items.push({
            warning: `Some items were omitted! The maximum number of items you can get is ${limit}`,
        });
    }

    return items;
};

/**
 * Get values from key-value store, it skips all non json values.
 */
const getValuesFromKeyValueStore = async (z, storeId, keys) => {
    const values = {};

    await Promise.map(keys, (key) => {
        return z
            .request(`${APIFY_API_ENDPOINTS.keyValueStores}/${storeId}/records/${key}`)
            .then((response) => {
                try {
                    const maybeObject = JSON.parse(response.content);
                    values[key] = maybeObject;
                } catch (err) {
                    // Ignore this, it can happen if kvs object is not a JSON.

                    // Shouldn't we replace it with something that makes it clear to user?
                    // For example JSON: { error: 'Cannot parse key-value store item: error-msg' }

                    // And basically you don't need this try/catch as you could handle this error in the catch bellow
                }
            })
            .catch((err) => {
                // I think that we should skip only 404 status code error and not any other
                z.console.log(`Skipping error ${err.message}: Can not get ${key} from store ${storeId}`);
            });
    });

    return values;
};

/**
 * Enriches task run object with data from dataset and key-value store.
 */
const enrichTaskRun = async (z, run, storeKeysToInclude = []) => {
    const { defaultKeyValueStoreId, defaultDatasetId } = run;

    if (defaultKeyValueStoreId) {
        // Shouldn't we prefix it with something like: keyValueStoreRecord_INPUT, ... ?
        // because there could theoretically be collision between kv-store key and run object property
        const keys = storeKeysToInclude.concat(DEFAULT_KEY_VALUE_STORE_KEYS);
        const keyValueStoreValues = await getValuesFromKeyValueStore(z, defaultKeyValueStoreId, keys);
        run = Object.assign({}, run, keyValueStoreValues);
    }

    if (defaultDatasetId) run.datasetItems = await getDatasetItems(z, defaultDatasetId, 500);

    return run;
};

module.exports = {
    enrichTaskRun,
};
