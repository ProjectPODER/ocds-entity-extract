const _ = require('lodash');
const Random = require('meteor-random');

function findItem(item, collection) {
    return collection.find({'simple': item.simple});
}

function insertItem(newItem, collection) {
    let insertable = Object.assign(newItem, {
        _id: Random.id(),
        created_at: new Date().toISOString(),
        ocds_contract_count: 1
    });
    // console.log(insertable);
    return collection.insert(insertable);
}

function updateItem(newItem, id, collection) {
    let updateable = newItem;
    let options = {
        $set: updateable,
        $inc: {'ocds_contract_count': 1},
        $currentDate: { lastModified: true }
    }
    // console.log(options);
    return collection.update( {'_id': id}, options );
}

function upsertPersonas(personas, db) {
    return new Promise((resolve, reject) => {
        const persons = db.get('persons', { castIds: false });
        let promises = [];

        _.forEach(personas, function(persona) {
            promises.push(findItem(persona[0], persons));
        });

        Promise.all(promises).then( (results) => {
            let subpromises = [];

            results.map( (res, index) => {
                if(res[0]) {
                    console.log('Found persona: ', res[0]._id);
                    subpromises.push(updateItem(personas[index][0], res[0]._id, persons));
                }
                else {
                    console.log('Not found persona: ', personas[index][0].simple);
                    subpromises.push(insertItem(personas[index][0], persons));
                }
            } );

            Promise.all(subpromises).then( (results) => {
                resolve(results);
            } );
        }).catch(e => {
            reject(e);
        });
    });
}

function upsertEmpresas(empresas, db) {
    return new Promise((resolve, reject) => {
        const orgs = db.get('organizations', { castIds: false });
        let promises = [];

        _.forEach(empresas, function(empresa) {
            promises.push(findItem(empresa[0], orgs));
        });

        Promise.all(promises).then( (results) => {
            results.map( (res, index) => {
                if(res[0]) {
                    console.log('Found empresa: ', res[0]._id);
                    updateItem(empresas[index][0], res[0]._id, orgs);
                }
                else {
                    console.log('Not found empresa: ', empresas[index][0].simple);
                    insertItem(empresas[index][0], orgs);
                }
            } );
            resolve(results);
        }).catch(e => {
            reject(e);
        });
    });
}

function upsertEntidades(entidades, db) {
    return new Promise((resolve, reject) => {
        const orgs = db.get('organizations', { castIds: false });
        let promises = [];

        _.forEach(entidades, function(entidad) {
            promises.push(findItem(entidad[0], orgs));
        });

        Promise.all(promises).then( (results) => {
            results.map( (res, index) => {
                if(res[0]) {
                    console.log('Found entidad: ', res[0]._id);
                    updateItem(entidades[index][0], res[0]._id, orgs);
                }
                else {
                    console.log('Not found entidad: ', entidades[index][0].simple);
                    insertItem(entidades[index][0], orgs);
                }
            } );
            resolve(results);
        }).catch(e => {
            reject(e);
        });
    });
}

module.exports = {
    upsertPersonas,
    upsertEmpresas,
    upsertEntidades
};
