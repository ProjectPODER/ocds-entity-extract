const _ = require('lodash');
const Random = require('meteor-random');
const fs = require('fs');

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
            promises.push(findItem(persona, persons));
        });

        Promise.all(promises).then( (results) => {
            let subpromises = [];

            results.map( (res, index) => {
                if(res[0]) {
                    //console.log('Found persona: ', res[0]._id);
                    console.log('PERSON,"' + personas[index].name + '",UPDATE');
                    subpromises.push(updateItem(personas[index], res[0]._id, persons));
                }
                else {
                    //console.log('Not found persona: ', personas[index].simple);
                    console.log('PERSON,"' + personas[index].name + '",CREATE');
                    subpromises.push(insertItem(personas[index], persons));
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
            promises.push(findItem(empresa, orgs));
        });

        Promise.all(promises).then( (results) => {
            results.map( (res, index) => {
                if(res[0]) {
                    // console.log('Found empresa: ', res[0]._id);
                    console.log('ORG,"' + empresas[index].name + '",UPDATE');
                    updateItem(empresas[index], res[0]._id, orgs);
                }
                else {
                    // console.log('Not found empresa: ', empresas[index].simple);
                    console.log('ORG,"' + empresas[index].name + '",CREATE');
                    insertItem(empresas[index], orgs);
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
            promises.push(findItem(entidad, orgs));
        });

        Promise.all(promises).then( (results) => {
            results.map( (res, index) => {
                if(res[0]) {
                    // console.log('Found entidad: ', res[0]._id);
                    console.log('ENTITY,"' + entidades[index].name + '",UPDATE');
                    updateItem(entidades[index], res[0]._id, orgs);
                }
                else {
                    // console.log('Not found entidad: ', entidades[index].simple);
                    console.log('ENTITY,"' + entidades[index].name + '",CREATE');
                    insertItem(entidades[index], orgs);
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
