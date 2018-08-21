const launder = require('company-laundry');
const removeDiacritics = require('diacritics').remove;
const _ = require('lodash');

// ----------
const diccionario = [   'abastecedor', 'abogados', 'academ', 'accesorio', 'aceite', 'aceros', 'acua?i?cultura', 'adhesiv', 'administrac?t?ion', 'advise?o?r',
                        'agency?(ia)?', 'agricola', 'agronomia', 'aguascalientes', 'aircraft', 'alarm', 'all?ian(ce)?(za)?', 'aliment', 'alquil',
                        'alternativ', 'alumbrado', 'aluminio', 'ambient', 'american', 'anali?y?sis', 'anonim', 'arquitect', 'arrenda', 'articulo', 'asegura',
                        'asesor', 'as(f|ph)alt', 'ass?ocia', 'atlantic', '\baudio', 'automotriz', 'auxiliar',
                        'bebida', 'beneficencia', '\bbio\b', 'british', 'bufete', 'business',
                        'cable', 'calidad', 'camion', 'capacita', 'carretera', '\bcent(er|ro|ral)\b', 'cientific', 'cirugia', 'ciudad', '\bclima(s|te)?\b',
                        'club', 'colecciones', 'colegio', 'combustible', 'comm?ercial', 'comisariado', 'comision', 'compan(ia|y)', 'competencia', 'complemento',
                        'comput', 'comunal', 'comunica', 'concentrado', 'concreto', '(con)?federacion', 'conferenc', 'conserva(c|t)ion', 'consorcio',
                        'construc', 'consult', 'consumibles', 'continental', 'control', 'cooperativ', 'corpora(c|t)ion', 'cultur',
                        'deporte', 'desarroll', 'desierto', 'diagnostic', 'dibujo', 'digital', 'direcc', 'diseno', 'distrib', 'drenaje', '(pro)?ducto',
                        'ecolog', 'economi', 'edifica', 'edicion', 'editor', 'educa', 'eff?icient', 'ejido', 'electr', 'empresa', 'endoscopia', 'energ', 'engine',
                        'envase', 'equip', 'escolar', 'special', 'esta(do|tal)', 'strateg', 'structur', 'estudio', 'evalua', 'event', 'explor',
                        'export', 'express', 'extintor',
                        'fabrica', 'factory', 'farmac', 'federal', 'ferreter', 'fianza', 'fideicomiso', 'filtro', '\bfinal\b', 'financ', 'formacion', 'formas',
                        'foto', 'fo?unda(c|t)ion', 'frenos', 'frutas', 'fumigac',
                        'ganader', 'geotecnia', 'general', 'gerencia', 'global', 'gobierno', 'grafic', 'gruas', '\bgrupo',
                        'healthcare', 'hermanos', 'herraje', 'herramienta', 'h(i|y)draulic', 'hidroelectr', 'hidrotecnia', 'hospital',
                        'implement', 'import', 'impres', 'independiente', 'industr', 'informatic', 'infra', 'ingenier', 'iniciativa', 'inmobiliari',
                        'inn?ova', 'inspec', 'instal', 'institu', 'instrument', 'insumo', 'insurance', 'intell?igen', 'integra', 'investiga',
                        'jardineria',
                        'laborator', '\blabs\b', '\blatin(a|o)', 'legumbres', 'libreria', 'licitante', 'limited', 'limpieza', 'llantas', 'lubric',
                        'mantenimiento', 'manufactur', 'marcas', 'material', 'maquina', 'mazatlan', 'mech?anic', 'medicin', 'medic(a|o)',
                        '\bmedios', 'mercantil', 'metal', '\bmetro', 'mexic', 'monitor', 'motor', 'mueble', 'multi', 'mundial', 'municip',
                        'na(c|t)ional', 'negocios', 'network', '(no|su)ro?este', 'norte', 'noticia',
                        'obras', 'occidente', 'oficina', 'oftalmolog', 'opera(d|t)or', 'organismo', 'organiza', 'oriente', 'outsourcing',
                        'pacific', 'patronato', 'pavimento', 'perforacion', 'periodi', 'pintura', 'plata?form', 'policia', 'power',
                        'print', 'privad', 'proces', 'produc', 'profess?ional', 'program', 'promo', 'protec', 'proveedor', 'pro(y|j)ect',
                        'public',
                        'quimic',
                        '\bradio', 'rec(i|y)cl', 'recolect', 'refacc', 'refri', 'region', 'remodel', 'remolque', 'repara', 'represent', 'repuesto',
                        'satelital', 'secretar', 'segur(idad|o)', 'servic', 'sindicato', 's(i|y)stem', 'sociedad', 'software', 'solu(c|t)ion',
                        'soporte', 'suministro', 'supervis', 'supply', 'surtidor',
                        'taller', '\btech\b', 'tech?n(o|i)', 'tejidos', 'telecom', 'tension', 'terraceria', 'terrestre', 'traduccion', 'transform',
                        'transport', 'tratamiento', 'travel', 'to?uris',
                        'unidad', 'uniform', 'union', 'univers(i|a)', 'urbaniz',
                        'valvula', 'vehic', 'video', 'vigila', 'vivienda'];

// Function stolen from import-compranet...
function _isEmpresa(string){
  // constains exactly one word
  if (_.words(string).length === 1) { return true }
  // has exactly one space
  //if ( (string.match(/ /g)|| []).length ===1 ) { return true }

  // Revisar las terminaciones comunes para una empresa
  //    CV, BV, SCP, RL
  if( string.match( /\s(cv|bv|scp|rl|pcs)$/i ) ) { return true }

  // Revisar si empieza con CIA (compañia)
  if( string.match( /^cia\s/i ) ) { return true }

  // Cuando es PALABRA y PALABRA
  if( string.match( /^(\w+)\sy\s(\w+)$/i ) ) { return true }

  // Usar diccionario para comparar
  var re = new RegExp(diccionario.join("|"), "i");
  if( re.test(string) ) { return true }

  // Regex breakdown:
  // /\d                            => si tiene algun numero
  // |,                             => contiene comas (,)
  // |\.                            => contiene puntos (.)
  // |\s&                           => contiene &
  // |\sof\s
  // |\sand\s
  // |\sthe\s                       => contiene las palabras of, and, the
  // |\(.*\)                        => contiene algo entre paréntesis
  // |inc
  // |corp
  // |ltd
  // |gmbh?                         => contiene las palabras inc, corp, ltd, gmbh
  // |gro?upo?                      => contiene la palabra group o grupo
  // |\singenieria
  // |\sbanco
  // |\sahorro
  // |\snacional
  // |\sservicios
  // |\sfinancieros                 => contiene las palabras ingenieria, banco, ahorro, nacional, servicios, financieros
  // |\ss\.?a\.?\s?de?\s?c\.?v\.?   => intenta ver si contiene la combinación sa de cv (buggy)
  // |cv$                           => termina en cv
  // /i                             => case insensitive
  // return true or false based on string matches
  return /\d|,|\.|\s&|\sof\s|\sand\s|\sthe\s|\binc\b|\bcorp\b|\bltd\b|\bgmbh?\b|\sgro?upo?|\singenieria|\sbanco|\sahorro|\snacional|\sservicios|\sfinancieros|\ss\.?a\.?\s?de?\s?c\.?v\.?/i.test(string);
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
    else if(party.hasOwnProperty('roles')) {
        return party.roles;
    }
    else {
        return '';
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
        immediate_parent: simpleName(launder(data.parent)), // simple ...TODO: si el parent es igual que el nombre dejar este campo vacío
        name: data.name,
        names: data.additionalIdentifiers[0].legalName, // additional identifiers + ID UC
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
    if(contract.parties) {
        const parties = getParties(contract.parties);
        return [ parties.personas, parties.empresas, parties.entidades ];
    }

    return null;
}

module.exports = extractEntities, _isEmpresa;
