const launder = require('company-laundry');
const removeDiacritics = require('diacritics').remove;
const _ = require('lodash');

// ----------

// Function stolen from import-compranet...
function _isEmpresa(string){
  // constains exactly one word
  if (_.words(string).length === 1) { return true }
  // has exactly one space
  if ( (string.match(/ /g)|| []).length ===1 ) { return true }
  // return true or false based on string matches
  return /\d|,|\.|\s&|\sof\s|\sand\s|\sthe\s|\(.*\)|inc|corp|ltd|gmbh?|gro?upo?|\singenieria|\sbanco|\sahorro|\snacional|\sservicios|\sfinancieros|\ss\.?a\.?\s?de?\s?c\.?v\.?/i.test(string);
}

// Function stolen from cqort...
function simpleName(string) {
  return removeDiacritics(string)
    .replace(/[,.]/g, '') // remove commas and periods
    .toLowerCase();
}

// ----------

function getPartyRole(party) {
    // Los objetos de tipo buyer tienen el role en una propiedad directamente, los suppliers la traen en un array...
    if(party.hasOwnProperty('role')) {
        return party.role;
    }
    else {
        return party.roles['0'];
    }
}

function getPartyGovtLevel(level) {
    // OCDS es global, debemos convertir los valores a sus específicos para MX...
    switch(level) {
        case 'country': return 'APF';
        case 'region':  return 'GE';
        case 'city':    return 'GM';
    }
}

function createPersonaObject(data) {
    // El objeto base para la tabla persons...
    return {
        name: data.name,
        simple: simpleName(launder(data.name)), // simple
        source: 'OCDS'
    }
}

function createEmpresaObject(data) {
    // El objeto base para la tabla organizations...
    return {
        address: {
            country: data.hasOwnProperty('address') ? data.address.countryName : null
        },
        name: data.name,
        names: data.hasOwnProperty('additionalIdentifiers') ? [data.additionalIdentifiers['0'].legalName] : [data.name],
        simple: simpleName(launder(data.name)), // simple
        source: 'OCDS'
    }
}

function createEntidadObject(data) {
    // El objeto extendido para la tabla organizations, ya que las entidades traen más info...
    return {
        address: {
            country: data.address.countryName
            //city: '',
            //ocd_id: '', // Usar esquema ocd-division/country:mx/state:hidalgo/ cuando se resuelva lo de la region...
            //state: party.address.region, // Resolver que aparecen cosas que no son aqui...
        },
        immediate_parent: simpleName(launder(data.parent)), // simple
        name: data.name,
        names: data.additionalIdentifiers['0'].legalName, // additional identifiers + ID UC
        parent: simpleName(launder(data.memberOf.name)), // simple
        public: {
            government: getPartyGovtLevel(data.govLevel),
        },
        simple: simpleName(launder(data.name)), // simple
        source: 'OCDS'
        //type: '' // si es supplier ponerle Private Company
    }
}

function combineNonEmpty(list) {
    const results = [];

    if(list.length > 0) {
        for(var i=0; i<list.length; i++) {
            let listado = list[i];
            if(listado.length > 0) {
                results.push(listado);
            }
        }
    }

    return results;
}

function getParties(parties) {
    const partyObjects = {'empresas': [], 'personas': [], 'entidades': []};

    for(var i in parties) {
        const party = parties[i];
        const party_role = getPartyRole(party);

        if(party_role == 'supplier') {
            // AQUI se debe distinguir si es una persona o una empresa de alguna manera...
            const isEmpresa = _isEmpresa(party.name);

            if(isEmpresa) {
                partyObjects.empresas.push( createEmpresaObject(party) );
            }
            else {
                partyObjects.personas.push( createPersonaObject(party) );
            }
        }
        else if(party_role == 'buyer') {
            // Estos siempre van a ser entidades del gobierno, no hay que distinguir entre persona y empresa...
            partyObjects.entidades.push( createEntidadObject(party) );
        }
    }

    return partyObjects;
}

function getSuppliers(suppliers) {
    const supplierObjects = {'empresas': [], 'personas': []};

    for(var i in suppliers) {
        const supplier = suppliers[i];
        const isEmpresa = _isEmpresa(supplier.name);

        // Los suppliers pueden ser personas o empresas y hay que crear un objeto distinto para cada caso...
        if(isEmpresa) {
            supplierObjects.empresas.push( createEmpresaObject(supplier) );
        }
        else {
            supplierObjects.personas.push( createPersonaObject(supplier) );
        }
    }

    return supplierObjects;
}

function extractEntities(contract) {
    // Extraer entidades del objeto parties...
    const parties = getParties(contract.parties);
    // Extraer entidades del objeto suppliers...
    const suppliers = getSuppliers(contract.awards['0'].suppliers);

    // Debemos combinar los arrays de personas, entidades y empresas eliminando los que estén vacíos...
    const personas = combineNonEmpty([parties.personas, suppliers.personas]);
    const empresas = combineNonEmpty([parties.empresas, suppliers.empresas]);
    const entidades = combineNonEmpty([parties.entidades]);

    return [ personas, empresas, entidades ];
}

module.exports = extractEntities;
