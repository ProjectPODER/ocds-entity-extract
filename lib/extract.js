const removeDiacritics = require('diacritics').remove;
const _ = require('lodash');
const laundry = require('company-laundry');

function extractEntities(compiledRelease, releases, entities, classifierList, productIndex) {
    let contractItems = extractItems(compiledRelease, releases, entities, productIndex);

    if(compiledRelease.hasOwnProperty('parties')) {
        let parties = compiledRelease.parties;
        parties.map( (party) => {
            let partySources = getPartySources(party, releases);
            let metadata = { source: partySources[0], sourceRun: partySources[1] };
            switch(party.details.type) {
                case 'institution':
                    handleInstitution(compiledRelease, releases, party, entities, contractItems, metadata);
                    break;
                default:
                    let isCompany = null;
                    // Use classifierList first if available...
                    if(classifierList) {
                        isCompany = getEntityClassifier(party.name, classifierList);
                    }

                    if(party.details.type == 'company') isCompany = true;

                    // If there is no classifierList or it didn't find the object...
                    if(isCompany == null) {
                        isCompany = laundry.isCompany(party.name);
                    }

                    if(isCompany) handleCompany(compiledRelease, releases, party, entities, contractItems, metadata);
                    else handlePerson(compiledRelease, releases, party, entities, contractItems, metadata);
                    break;
            }
        } );
    }
}

function extractItems(compiledRelease, releases, entities, productIndex) {
    let items = [];

    if(compiledRelease.hasOwnProperty('contracts') && compiledRelease.contracts.length > 0) {
        compiledRelease.contracts.map( contract => {
            if(contract.hasOwnProperty('items') && contract.items.length > 0) {
                contract.items.map( item => {
                    // Crear producto si no existe
                    let product = null;
                    let prodID = getProductID(item);
                    let cbmeiProd = productIndex.hasOwnProperty(prodID)? productIndex[prodID] : null;
                    if(prodID /*&& cbmeiProd*/) {
                        let metadata = { source: getProductSources(item.id, releases) };
                        let prodIndex = findObjectInCollection(prodID, entities.products);
                        if(!prodIndex) {
                            product = createProduct(item, cbmeiProd, metadata);
                            entities.products[prodID] = product;
                        }
                        else {
                            product = entities.products[prodID];
                            mergeMetadata(entities.products[prodID], metadata);
                        }

                        if(item.hasOwnProperty('unit') && item.unit.hasOwnProperty('value')) {
                            let accumulatedPrice = product.avgUnitPrice * product.purchase_quantity.product;
                            let purchasePrice = item.unit.value.amount * item.quantity;
                            product.avgUnitPrice = (accumulatedPrice + purchasePrice) / (product.purchase_quantity.product + item.quantity);
                        }

                        product.purchase_count.product++;
                        product.purchase_amount.product += item.valueMxIMSS;
                        product.purchase_quantity.product += item.quantity;

                        if(item.hasOwnProperty('unit') && item.unit.hasOwnProperty('value') && item.unit.value.hasOwnProperty('amountOverpriceMxIMSS') && item.unit.value.amountOverpriceMxIMSS != 0) {
                            product.amount_over_all += parseFloat(item.unit.value.amountOverpriceMxIMSS);
                            if( parseFloat(item.unit.value.amountOverpriceMxIMSS) > 0 )
                                product.amount_over_with_overcost += parseFloat(item.unit.value.amountOverpriceMxIMSS);
                            if(item.unit.value.valueAverageMxIMSS != 0) {
                                product.quantity_lost_all += parseFloat(item.unit.value.amountOverpriceMxIMSS / item.unit.value.valueAverageMxIMSS);
                                if(parseFloat(item.unit.value.amountOverpriceMxIMSS) > 0)
                                    product.quantity_lost_with_overcost += parseFloat(item.unit.value.amountOverpriceMxIMSS / item.unit.value.valueAverageMxIMSS);
                            }
                        }

                        let purchaseDate = new Date(contract.period.startDate);
                        if(product.first_purchase_date == null) product.first_purchase_date = contract.period.startDate;
                        else {
                            let firstPurchase = new Date(product.first_purchase_date);
                            if(purchaseDate.getTime() < firstPurchase.getTime())
                                product.first_purchase_date = contract.period.startDate;
                        }

                        if(product.last_purchase_date == null) product.last_purchase_date = contract.period.startDate;
                        else {
                            let lastPurchase = new Date(product.last_purchase_date);
                            if(purchaseDate.getTime() > lastPurchase.getTime())
                                product.last_purchase_date = contract.period.startDate;
                        }

                        items.push(product);
                    }
                } );
            }
        } );
    }

    return items;
}

function createProduct(item, baseProduct, metadata) {
    let product = {}
    if(baseProduct) {
        product = baseProduct;
        delete product._id;
        if(metadata) {
            mergeMetadata(product, metadata);
        }
    }
    else {
        product = {
            id: item.id,
            description: item.description
        }
        if(item.hasOwnProperty('classification') && item.classification.hasOwnProperty('description')) Object.assign(product, { name: item.classification.description });
        if(metadata) Object.assign(product, metadata);
    }

    Object.assign(product, {
        purchase_count: { product: 0 },
        purchase_amount: { product: 0 },
        purchase_quantity: { product: 0 },
        avgUnitPrice: 0,
        quantity_lost_with_overcost: 0,
        quantity_lost_all: 0,
        amount_over_with_overcost: 0,
        amount_over_all: 0,
        first_purchase_date: null,
        last_purchase_date: null
    });

    return product;
}

function getProductID(item) {
    if(item.hasOwnProperty('id') && item.id != '') {
        if(item.id.indexOf('.') > 0) return item.id;
        else {
            if(item.id.length >= 12) {
                return item.id.substring(0, 3) + '.' + item.id.substring(3, 6) + '.' + item.id.substring(6, 10) + '.' + item.id.substring(10);
            }
            else return item.id;
        }
    }
    else return '';
}

function getProductSources(product_id, releases) {
    let sources = [];

    releases.map( (release) => {
        release.contracts.map( (contract) => {
            if(contract.hasOwnProperty('items') && contract.items.length > 0) {
                contract.items.map( (item) => {
                    if(item.id == product_id) {
                        release.source.map( (source) => {
                            let found = false;
                            sources.map((s) => {
                                if(s.id == source.id) found = true
                            });
                            if(!found) {
                                sources.push(source);
                            }
                        } );
                    }
                } );
            }
        } );
    } );

    return sources;
}

function isPurchase(sources) {
    let purchase = false;
    sources.map( s => {
        if(s.id == 'comprasimss') purchase = true;
    } );
    return purchase;
}

function getEntityClassifier(name, classifierList) {
    if(classifierList.hasOwnProperty(name)) {
        if(classifierList[name] == 'company') return true;
        else return false;
    }
    return null;
}

function handlePerson(compiledRelease, releases, party, entities, items, metadata) {
    let person = null;
    let personID = party.id;
    let persIndex = findObjectInCollection(personID, entities.persons);

    if(!persIndex) {
        person = createPerson(party, metadata, 'proveedor', entities);
        entities.persons[personID] = person;
    }
    else {
        person = entities.persons[personID];
        otherNames(person, party.name);
        otherIdentifiers(person, party);
        otherTypes(person, 'proveedor');
        mergeMetadata(person, metadata);
    }
    let firstSeenDate = getEarliestEntityDate(personID, releases);
    mergeDates(person, firstSeenDate);

    if( isPurchase(compiledRelease.source) ) {
        let item_summary = getContractItemSummary(compiledRelease, items);
        entities.persons[personID].purchase_count.supplier += item_summary[0];
        entities.persons[personID].purchase_amount.supplier += parseFloat(item_summary[1]);
    }
    else {
        let contract_summary = getSupplierContractSummary(personID, compiledRelease);
        entities.persons[personID].contract_count.supplier += contract_summary[0];
        entities.persons[personID].contract_amount.supplier += parseFloat(contract_summary[1]);
    }
}

function handleCompany(compiledRelease, releases, party, entities, items, metadata) {
    let company = null;
    let companyID = party.id;
    let compIndex = findObjectInCollection(companyID, entities.companies);
    let s_instIndex = findObjectInCollection(companyID, entities.institutions);

    if(!compIndex && !s_instIndex) {
        company = createCompany(party, metadata, entities);
        entities.companies[companyID] = company;
        compIndex = true;
    }
    else {
        if(s_instIndex)
            company = entities.institutions[companyID];
        else
            company = entities.companies[companyID];
        otherIdentifiers(company, party);
        otherNames(company, party.name);
        mergeMetadata(company, metadata);
    }
    let firstSeenDate = getEarliestEntityDate(companyID, releases);
    mergeDates(company, firstSeenDate);

    let contract_summary = getSupplierContractSummary(companyID, compiledRelease);
    let collection = null;
    if(compIndex) {
        collection = entities.companies;
    }
    else if(s_instIndex) {
        collection = entities.institutions;
    }

    if( isPurchase(compiledRelease.source) ) {
        let item_summary = getContractItemSummary(compiledRelease, items);
        collection[companyID].purchase_count.supplier += item_summary[0];
        collection[companyID].purchase_amount.supplier += parseFloat(item_summary[1]);
    }
    else {
        collection[companyID].contract_count.supplier += contract_summary[0];
        collection[companyID].contract_amount.supplier += parseFloat(contract_summary[1]);
    }
}

function getEarliestEntityDate(id, releases) {
    let date = null;
    releases.map( r => {
        if(r.hasOwnProperty('date')) {
            r.parties.map( p => {
                if( p.id == id || (p.hasOwnProperty('memberOf') && p.memberOf[0].id == id) ||  (p.hasOwnProperty('contactPoint') && p.contactPoint.id == id) ) {
                    if(!date) date = r.date;
                    else {
                        var d1 = Date.parse(r.date);
                        var d2 = Date.parse(date);
                        if (d1 < d2) {
                            date = r.date;
                        }
                    }
                }
            } )
        }
    } )
    return date;
}

function mergeDates(entity, firstSeenDate) {
    if(!entity.hasOwnProperty('date')) Object.assign(entity, { 'date': firstSeenDate });
    else {
        var d1 = Date.parse(firstSeenDate);
        var d2 = Date.parse(entity.date);
        if (d1 < d2) {
            entity.date = firstSeenDate;
        }
    }
}

function handleInstitution(compiledRelease, releases, party, entities, items, metadata) {
    let institution = null;
    let institutionID = party.id;
    let instIndex = findObjectInCollection(institutionID, entities.institutions);
    if(!instIndex) {
        institution = createInstitution(party, metadata);
        entities.institutions[institutionID] = institution;
    }
    else {
        institution = entities.institutions[institutionID];
        otherNames(institution, party.name);
        mergeMetadata(institution, metadata);
    }
    let firstSeenDate = getEarliestEntityDate(institutionID, releases);
    mergeDates(institution, firstSeenDate);

    let parent = null;
    let parentID = null;
    let membership = null;
    let parentIndex = null;
    if(party.hasOwnProperty('memberOf') && (party.memberOf[0].id != '') && (party.memberOf[0].id != party.id)) {
        parentID = party.memberOf[0].id;
        parentIndex = findObjectInCollection(parentID, entities.institutions);

        if(!parentIndex) {
            let parent_party = {
                id: party.memberOf[0].id,
                name: party.memberOf[0].name,
                govLevel: party.details.govLevel,
                address: party.address
            }
            if(party.memberOf[0].hasOwnProperty('initials')) Object.assign(parent_party, { initials: party.memberOf[0].initials });
            parent = createInstitution(parent_party, metadata);
            entities.institutions[parentID] = parent;
        }
        else {
            parent = entities.institutions[parentID];
            otherNames(parent, party.memberOf[0].name);
            mergeMetadata(parent, metadata);
        }
        firstSeenDate = getEarliestEntityDate(parentID, releases);
        mergeDates(parent, firstSeenDate);

        if(institutionID != '' && parentID != '') {
            let membershipID = institutionID + '_' + parentID;
            let memberIndex = findObjectInCollection(membershipID, entities.memberships);

            if(!memberIndex) {
                membership = createOrgMembership(membershipID, entities.institutions[institutionID], entities.institutions[parentID], metadata);
                entities.memberships[membershipID] = membership;
            }
        }
    }

    let encargadoUC = null;
    let encargadoID = null;
    let encargadoIndex = null;
    // Agregar el encargado de la UC...
    if(party.hasOwnProperty('contactPoint')) {
        encargadoID = party.contactPoint.id;
        encargadoIndex = findObjectInCollection(encargadoID, entities.persons);
        if(!encargadoIndex) {
            encargadoUC = createPerson( { id: encargadoID, name: party.contactPoint.name }, metadata, 'funcionario', entities );
            entities.persons[encargadoID] = encargadoUC;
        }
        else {
            otherTypes(entities.persons[encargadoID], 'funcionario');
        }
        firstSeenDate = getEarliestEntityDate(encargadoID, releases);
        mergeDates(entities.persons[encargadoID], firstSeenDate);

        // Membership del encargado a la UC
        let encargadoMemberID = encargadoID + '_' + institutionID;
        let encargadoMemberIndex = findObjectInCollection(encargadoMemberID, entities.memberships);
        if(!encargadoMemberIndex) {
            let encargadoMember = createPersonMembership(encargadoMemberID, entities.persons[encargadoID], entities.institutions[institutionID], metadata);
            entities.memberships[encargadoMemberID] = encargadoMember;
        }
    }

    let country = null;
    let countryID = null;
    let countryIndex = null;
    let countryCode = null;

    let state = null;
    let stateID = null;
    let stateIndex = null;

    let municipality = null;
    let municipalityID = null;
    let municipalityIndex = null;

    let municipalityStateMembership = null;
    let municipalityStateMembershipID = null;

    let stateCountryMembership = null;
    let stateCountryMembershipID = null;

    // Agregar estado y municipalidad si aplica
    let govLevel = null;
    if(party.hasOwnProperty('govLevel')) govLevel = party.govLevel;
    else if( party.hasOwnProperty('details') && party.details.hasOwnProperty('govLevel') ) govLevel = party.details.govLevel;
    if(govLevel != null) {
        countryCode = laundry.cleanCountry(party.address.countryName);
        countryID = laundry.simpleName(countryCode);
        // Crear el país
        countryIndex = findObjectInCollection(countryID, entities.states);
        if(!countryIndex) {
            // Crear el estado
            country = createCountry(countryID, party.address.countryName, metadata);
            entities.states[countryID] = country;
        }
        else {
            country = entities.states[countryID];
        }

        switch(govLevel) {
            case 'city':
                // Crear el estado
                stateID = getStateID(party.address, countryCode);
                stateIndex = findObjectInCollection(stateID, entities.states);
                if(!stateIndex) {
                    // Crear el estado
                    state = createState('state', stateID, party.address.region, country, metadata);
                    entities.states[stateID] = state;

                    // Crear membership de estado a país
                    stateCountryMembershipID = countryID + '_' + stateID;
                    stateCountryMembership = createCountryMembership(stateCountryMembershipID, country, state, metadata);
                    entities.memberships[stateCountryMembershipID] = stateCountryMembership;
                }
                else {
                    state = entities.states[stateID];
                }

                // Crear la municipalidad
                municipalityID = stateID + '-' + laundry.simpleName(laundry.launder(party.address.locality));
                municipalityIndex = findObjectInCollection(municipalityID, entities.states);
                if(!municipalityIndex) {
                    // Crear la municipalidad
                    municipality = createState('city', municipalityID, party.address.locality, state, metadata);
                    entities.states[municipalityID] = municipality;

                    // Crear membership de municipalidad a estado
                    municipalityStateMembershipID = municipalityID + '_' + stateID;
                    municipalityStateMembership = createStateMembership(municipalityStateMembershipID, state, municipality, metadata);
                    entities.memberships[municipalityStateMembershipID] = municipalityStateMembership;
                }
                else {
                    municipality = entities.states[municipalityID];
                }

                // Agregar membership de la institution a la municipalidad
                let orgMunicipalityMembershipID = institutionID + '_' + municipalityID;
                let orgMunicipalityMemberIndex = findObjectInCollection(orgMunicipalityMembershipID, entities.memberships);
                if(!orgMunicipalityMemberIndex) {
                    let orgMunicipalityMembership = createOrgMunicipalityMembership(orgMunicipalityMembershipID, institution, municipality, metadata);
                    entities.memberships[orgMunicipalityMembershipID] = orgMunicipalityMembership;
                }

                if(parent) {
                    // Agregar membership del parent a la municipalidad
                    let parentMunicipalityMembershipID = parentID + '_' + municipalityID;
                    let parentMunicipalityMemberIndex = findObjectInCollection(parentMunicipalityMembershipID, entities.memberships);
                    if(!parentMunicipalityMemberIndex) {
                        let parentMunicipalityMembership = createOrgMunicipalityMembership(parentMunicipalityMembershipID, parent, municipality, metadata);
                        entities.memberships[parentMunicipalityMembershipID] = parentMunicipalityMembership;
                    }
                }
                break;
            case 'region':
                stateID = getStateID(party.address, countryCode);
                stateIndex = findObjectInCollection(stateID, entities.states);
                if(!stateIndex) {
                    // Crear el estado
                    state = createState('state', stateID, party.address.region, country, metadata);
                    entities.states[stateID] = state;

                    // Crear membership de estado a país
                    stateCountryMembershipID = countryID + '_' + stateID;
                    stateCountryMembership = createCountryMembership(stateCountryMembershipID, country, state, metadata);
                    entities.memberships[stateCountryMembershipID] = stateCountryMembership;
                }
                else {
                    state = entities.states[stateID];
                }

                // Agregar membership de la institution al estado
                let orgStateMembershipID = institutionID + '_' + stateID;
                let orgStateMemberIndex = findObjectInCollection(orgStateMembershipID, entities.memberships);
                if(!orgStateMemberIndex) {
                    orgStateMembership = createOrgStateMembership(orgStateMembershipID, institution, state, metadata);
                    entities.memberships[orgStateMembershipID] = orgStateMembership;
                }

                if(parent) {
                    // Agregar membership del parent al estado
                    let parentStateMembershipID = parentID + '_' + stateID;
                    let parentStateMemberIndex = findObjectInCollection(parentStateMembershipID, entities.memberships);
                    if(!parentStateMemberIndex) {
                        let parentStateMembership = createOrgStateMembership(parentStateMembershipID, parent, state, metadata);
                        entities.memberships[parentStateMembershipID] = parentStateMembership;
                    }
                }
                break;
        }

        Object.assign(entities.institutions[institutionID], { govLevel: govLevel });
        if(parent)
            Object.assign(entities.institutions[parentID], { govLevel: govLevel });
    }
    else {
        if(party.hasOwnProperty('address')) {
            if(party.address.hasOwnProperty('countryName')) {
                countryCode = laundry.cleanCountry(party.address.countryName);
                countryID = laundry.simpleName(countryCode);
                // Crear el país
                countryIndex = findObjectInCollection(countryID, entities.states);
                if(!countryIndex) {
                    // Crear el estado
                    country = createCountry(countryID, party.address.countryName, metadata);
                    entities.states[countryID] = country;
                }
                else {
                    country = entities.states[countryID];
                }
            }
        }
    }


    let summary = null;
    let countName = '';
    let amountName = '';
    let buyerContracts = getBuyerContracts(institutionID, releases);

    if( isPurchase(metadata.source) ) {
        summary = getBuyerContractItemSummary(compiledRelease, buyerContracts, items);
        countName = 'purchase_count';
        amountName = 'purchase_amount';
    }
    else {
        summary = getBuyerContractSummary(institutionID, buyerContracts, compiledRelease);
        countName = 'contract_count';
        amountName = 'contract_amount';
    }

    if(party.roles[0] == 'funder') {
        entities.institutions[institutionID][countName].funder += summary[0];
        entities.institutions[institutionID][amountName].funder += parseFloat(summary[1]);
    }
    else {
        entities.institutions[institutionID][countName].buyer += summary[0];
        entities.institutions[institutionID][amountName].buyer += parseFloat(summary[1]);
    }

    if(parentID && (parentID != party.id)) {
        entities.institutions[parentID][countName].buyer += summary[0];
        entities.institutions[parentID][amountName].buyer += parseFloat(summary[1]);
    }
    if(encargadoID) {
        entities.persons[encargadoID][countName].buyer += summary[0];
        entities.persons[encargadoID][amountName].buyer += parseFloat(summary[1]);
    }

    // Actualizar contract_counts y amounts de país, estado y municipalidad
    if(countryID) {
        // Maybe area was seen before in a company, therefore it has no count (only institutions get counts)
        if(!entities.states[countryID].hasOwnProperty(countName)) {
            entities.states[countryID][countName] = { area: 0 }
            entities.states[countryID][amountName] = { area: 0 }
        }
        entities.states[countryID][countName].area += summary[0];
        entities.states[countryID][amountName].area += parseFloat(summary[1]);
    }
    if(stateID) {
        // Maybe area was seen before in a company, therefore it has no count (only institutions get counts)
        if(!entities.states[stateID].hasOwnProperty(countName)) {
            entities.states[stateID][countName] = { area: 0 }
            entities.states[stateID][amountName] = { area: 0 }
        }
        entities.states[stateID][countName].area += summary[0];
        entities.states[stateID][amountName].area += parseFloat(summary[1]);
    }
    if(municipalityID) {
        // Maybe area was seen before in a company, therefore it has no count (only institutions get counts)
        if(!entities.states[municipalityID].hasOwnProperty(countName)) {
            entities.states[municipalityID][countName] = { area: 0 }
            entities.states[municipalityID][amountName] = { area: 0 }
        }
        entities.states[municipalityID][countName].area += summary[0];
        entities.states[municipalityID][amountName].area += parseFloat(summary[1]);
    }
}

function getBuyerContracts(id, releases) {
    let contractIDs = [];
    releases.map( release => {
        let isBuyer = release.parties.filter( (party) => party.id == id );
        if(isBuyer.length > 0) {
            release.contracts.map( contract => contractIDs.push(contract.id) );
        }
    } );
    return contractIDs;
}

function otherNames(entity, new_name) {
    if(entity.name != new_name) {
        let othernames = entity.other_names.filter( othername => othername.name == new_name );
        if(othernames.length == 0) {
            entity.other_names.push( { name: new_name } );
        }
    }
}

function otherIdentifiers(entity, party) {
    let ids = [];
    if(party.hasOwnProperty('identifier')) {
        ids.push(party.identifier);
    }
    if(party.hasOwnProperty('additionalIdentifiers')) {
        party.additionalIdentifiers.map( id => ids.push(id) );
    }

    ids.map( (id) => {
        let found = entity.identifiers.filter( (e_id) => (e_id.id == id.id) && (e_id.scheme == id.scheme) );
        if(found.length == 0) entity.identifiers.push(id);
    } );
}

function otherTypes(entity, new_type) {
    if(entity.classification.length > 0) {
        let types = entity.classification.filter( type => type == new_type );
        if(types.length == 0) {
            entity.classification.push( new_type );
        }
    }
    else {
        entity.classification = [new_type];
    }
}

function getPartySources(party, releases) {
    let sources = [];
    let sourceRuns = [];

    releases.map( (release) => {
        release.parties.map( (r_party) => {
            if(r_party.id == party.id) {
                release.source.map( (source) => {
                    let found = false;
                    sources.map((s) => {
                        if(s.id == source.id) found = true
                    });
                    if(!found) {
                        sources.push(source);
                    }
                } );

                release.sourceRun.map( (sourceRun) => {
                    let found = false;
                    sourceRuns.map((s) => {
                        if(s.id == sourceRun.id) found = true
                    });
                    if(!found) {
                        sourceRuns.push(sourceRun);
                    }
                } );
            }
        } );
    } );

    return [sources, sourceRuns];
}

function mergeMetadata(item, metadata) {
    metadata.source.map( (source) => {
        let found = false;
        item.source.map( (itemSource) => {
            if(itemSource.id == source.id) {
                found = true;
            }
        } );
        if(!found) {
            item.source.push({ id: source.id });
        }
    } );
}

function createCompany(party, metadata, entities) {
    let org = {
        id: party.id,
        name: party.name,
        other_names: [],
        classification: ['company'],
        contract_count: {
            buyer: 0,
            supplier: 0
        },
        contract_amount: {
            buyer: 0,
            supplier: 0
        },
        purchase_count: {
            buyer: 0,
            supplier: 0,
            funder: 0
        },
        purchase_amount: {
            buyer: 0,
            supplier: 0,
            funder: 0
        }
    };

    let type = laundry.companyType(party.name);
    if(type != '') {
        Object.assign(org, {
            subclassification: [type]
        });
    }

    let identifiers = [];
    if(party.hasOwnProperty('identifier')) {
        identifiers.push(party.identifier);
    }
    if(party.hasOwnProperty('additionalIdentifiers')) {
        identifiers.push(...party.additionalIdentifiers);
    }
    Object.assign(org, {
        identifiers: identifiers
    });

    let countryID = 'mx';
    let country = 'MX';
    let countryName = "México";
    if(party.hasOwnProperty('address') && party.address.hasOwnProperty('countryName')) {
        country = laundry.cleanCountry(party.address.countryName);
        countryID = laundry.simpleName(country);
        if(party.address.countryName.length == 2)
            countryName = getCountryName(party.address.countryName);
        else
            countryName = party.address.countryName;

        let countryIndex = findObjectInCollection(countryID, entities.states);
        if(!countryIndex) {
            let countryObj = createCountry(countryID, countryName, metadata);
            delete countryObj.contract_count;
            delete countryObj.contract_amount;
            delete countryObj.purchase_count;
            delete countryObj.purchase_amount;
            entities.states[countryID] = countryObj;
        }
    }
    let area = [{
        id: countryID,
        name: countryName,
        classification: ['country']
    }];
    Object.assign(org, { area: area });

    if(metadata) {
        Object.assign(org, metadata);
    }

    return org;
}

function createCountry(id, name, metadata) {
    let country = {
        id: id,
        name: name,
        classification: ['country'],
        contract_count: { area: 0 },
        contract_amount: { area: 0 },
        purchase_count: { area: 0 },
        purchase_amount: { area: 0 }
    };

    if(metadata) {
        Object.assign(country, metadata);
    }

    return country;
}

function createState(type, id, name, parent = null, metadata) {
    let state = {
        id: id,
        name: name,
        classification: [type],
        contract_count: { area: 0 },
        contract_amount: { area: 0 },
        purchase_count: { area: 0 },
        purchase_amount: { area: 0 }
    };

    if(parent)  Object.assign(state, { parent_id: parent.id, parent_name: parent.name });
    else        Object.assign(state, { parent_id: 'mx', parent_name: 'México' });

    let otherNames = getOtherStateNames(name);
    if(otherNames) {
        let otherNamesArr = []
        otherNames.map( on => otherNamesArr.push( { name: on } ) );
        Object.assign(state, { other_names: otherNamesArr });
    }

    if(metadata) {
        Object.assign(state, metadata);
    }

    return state;
}

function createInstitution(party, metadata) {
    let org = {
        id: party.id,
        name: party.name,
        other_names: [],
        classification: ['institution'],
        contract_count: {
            buyer: 0,
            supplier: 0,
            funder: 0
        },
        contract_amount: {
            buyer: 0,
            supplier: 0,
            funder: 0
        },
        purchase_count: {
            buyer: 0,
            supplier: 0,
            funder: 0
        },
        purchase_amount: {
            buyer: 0,
            supplier: 0,
            funder: 0
        }
    };

    let subclass = '';
    if(party.hasOwnProperty('roles') && party.roles[0] == 'funder') {
        subclass = 'banco';
    }
    else if(party.hasOwnProperty('details') && party.details.hasOwnProperty('classification')) {
        subclass = party.details.classification;
    }
    else if(party.hasOwnProperty('memberOf')) {
        Object.assign(org, { parent_id: party.memberOf[0].id });
        subclass = 'unidad-compradora';
    }
    else {
        subclass = 'dependencia';
    }
    Object.assign(org, { subclassification: [subclass] });

    let identifiers = [];
    if(party.hasOwnProperty('identifier')) {
        identifiers.push(party.identifier);
    }
    if(party.hasOwnProperty('additionalIdentifiers')) {
        identifiers.push(...party.additionalIdentifiers);
    }
    if(party.hasOwnProperty('initials')) {
        identifiers.push({ id: laundry.simpleName(party.initials), legalName: party.initials });
    }
    Object.assign(org, {
        identifiers: identifiers
    });

    if(party.hasOwnProperty('contactPoint')) {
        Object.assign(org, { contact_details: [ { type: 'contactPoint', value: party.contactPoint.name } ] });
    }

    let govLevel = null;
    if(party.hasOwnProperty('govLevel')) govLevel = party.govLevel;
    else if( party.hasOwnProperty('details') && party.details.hasOwnProperty('govLevel') ) govLevel = party.details.govLevel;

    if(govLevel != null) {
        let area = [];
        let countryCode = laundry.cleanCountry(party.address.countryName);
        let countryName = getCountryName(party.address.countryName);
        let regionID = getStateID(party.address, countryCode);

        switch(govLevel) {
            case 'city':
                let cityObj = {
                    id: regionID + '-' + laundry.simpleName(laundry.launder(party.address.locality)),
                    name: party.address.locality,
                    classification: ['city'],
                    parent_id: regionID,
                    parent: party.address.region
                };
                area.push(cityObj);
            case 'region':
                let otherNames = getOtherStateNames(party.address.region);
                let stateObj = {
                    id: regionID,
                    name: party.address.region,
                    classification: ['region'],
                    parent_id: laundry.simpleName(countryCode),
                    parent: countryCode
                };
                if(otherNames) {
                    let otherNamesArr = []
                    otherNames.map( on => otherNamesArr.push( { name: on } ) );
                    Object.assign(stateObj, { other_names: otherNamesArr });
                }
                area.push(stateObj);
            case 'country':
                let countryObj = {
                    id: laundry.simpleName(countryCode),
                    name: countryName,
                    classification: ['country']
                };
                area.push(countryObj);
                break;
        }

        Object.assign(org, { area: area, govLevel: govLevel });
    }
    else {
        if(party.hasOwnProperty('address')) {
            let area = [];
            if(party.address.hasOwnProperty('countryName')) {
                let countryCode = laundry.cleanCountry(party.address.countryName);
                let countryName = getCountryName(party.address.countryName);
                let countryObj = {
                    id: laundry.simpleName(countryCode),
                    name: countryName,
                    classification: ['country']
                };
                area.push(countryObj);
            }
            if(party.address.hasOwnProperty('region')) {
                let regionID = getStateID(party.address, countryCode);
                let otherNames = getOtherStateNames(party.address.region);
                let stateObj = {
                    id: regionID,
                    name: party.address.region,
                    classification: ['region'],
                    parent_id: laundry.simpleName(countryCode),
                    parent: countryCode
                };
                if(otherNames) {
                    let otherNamesArr = []
                    otherNames.map( on => otherNamesArr.push( { name: on } ) );
                    Object.assign(stateObj, { other_names: otherNamesArr });
                }
                area.push(stateObj);
            }
            if(party.address.hasOwnProperty('locality')) {
                let cityObj = {
                    id: regionID + '-' + laundry.simpleName(laundry.launder(party.address.locality)),
                    name: party.address.locality,
                    classification: ['city'],
                    parent_id: regionID,
                    parent: party.address.region
                };
                area.push(cityObj);
            }
            Object.assign(org, { area: area });
        }
    }

    if(metadata) {
        Object.assign(org, metadata);
    }

    return org;
}

function getOtherStateNames(state) {
    let otherNames = null;
    switch(state) {
        case 'Coahuila': return ['Coahuila de Zaragoza'];
        case 'Estado de México': return ['México'];
        case 'Michoacán': return ['Michoacán de Ocampo'];
        case 'Veracruz': return ['Veracruz de Ignacio de la Llave'];
    }
    return otherNames;
}

function getStateID(address, country) {
    let id = '';
    if(address.hasOwnProperty('region')) {
        if(country == 'MX') {
            switch(address.region) { // returns ISO-3166-2:MX codes
                case 'Aguascalientes': id = 'agu';
                    break;
                case 'Baja California': id = 'bcn';
                    break;
                case 'Baja California Sur': id = 'bcs';
                    break;
                case 'Campeche': id = 'cam';
                    break;
                case 'Chiapas': id = 'chp';
                    break;
                case 'Chihuahua': id = 'chh';
                    break;
                case 'Ciudad de México':
                case 'Ciudad de Mexico':
                    id = 'cmx';
                    break;
                case 'Coahuila':
                case 'Coahuila de Zaragoza':
                    id = 'coa';
                    break;
                case 'Colima': id = 'col';
                    break;
                case 'Durango': id = 'dur';
                    break;
                case 'Guerrero': id = 'gro';
                    break;
                case 'Guanajuato': id = 'gua';
                    break;
                case 'Hidalgo': id = 'hid';
                    break;
                case 'Jalisco': id = 'jal';
                    break;
                case 'Mexico':
                case 'México':
                case 'Estado de México':
                case 'Estado de Mexico':
                    id = 'mex';
                    break;
                case 'Michoacan de Ocampo':
                case 'Michoacán de Ocampo':
                case 'Michoacán':
                case 'Michoacan':
                    id = 'mic';
                    break;
                case 'Morelos': id = 'mor';
                    break;
                case 'Nayarit': id = 'nay';
                    break;
                case 'Nuevo León':
                case 'Nuevo Leon':
                    id = 'nle';
                    break;
                case 'Oaxaca': id = 'oax';
                    break;
                case 'Puebla': id = 'pue';
                    break;
                case 'Querétaro': id = 'que';
                    break;
                case 'Quintana Roo': id = 'roo';
                    break;
                case 'San Luis Potosi':
                case 'San Luis Potosí':
                    id = 'slp';
                    break;
                case 'Sinaloa': id = 'sin';
                    break;
                case 'Sonora': id = 'son';
                    break;
                case 'Tabasco': id = 'tab';
                    break;
                case 'Tamaulipas': id = 'tam';
                    break;
                case 'Tlaxcala': id = 'tla';
                    break;
                case 'Veracruz':
                case 'Veracruz de Ignacio de la Llave':
                    id = 'ver';
                    break;
                case 'Yucatan':
                case 'Yucatán':
                    id = 'yuc';
                    break;
                case 'Zacatecas': id = 'zac';
                    break;
            }
        }
        else {
            id = laundry.simpleName(address.region);
        }

        id = laundry.simpleName(country) + '-' + id;
    }
    return id;
}

function createCountryMembership(id, country, state, metadata) {
    let membership = {
        id: id,
        role: "Estado",
        organization_id: state.id,
        organization_name: state.name,
        organization_class: 'state',
        parent_id: country.id,
        parent_name: country.name,
        parent_class: 'country'
    }

    if(metadata) {
        Object.assign(membership, metadata);
    }

    return membership;
}

function createStateMembership(id, state, municipality, metadata) {
    let membership = {
        id: id,
        role: "Municipio",
        organization_id: municipality.id,
        organization_name: municipality.name,
        organization_class: 'city',
        parent_id: state.id,
        parent_name: state.name,
        parent_class: 'state'
    }

    if(metadata) {
        Object.assign(membership, metadata);
    }

    return membership;
}

function createOrgStateMembership(id, org, state, metadata) {
    let membership = {
        id: id,
        role: "Pertenece a Estado",
        organization_id: org.id,
        organization_name: org.name,
        organization_class: org.classification[0],
        organization_subclass: org.subclassification[0],
        parent_id: state.id,
        parent_name: state.name,
        parent_class: 'state'
    }

    if(metadata) {
        Object.assign(membership, metadata);
    }

    return membership;
}

function createOrgMunicipalityMembership(id, org, municipality, metadata) {
    let membership = {
        id: id,
        role: "Pertenece a Municipio",
        organization_id: org.id,
        organization_name: org.name,
        organization_class: org.classification[0],
        organization_subclass: org.subclassification[0],
        parent_id: municipality.id,
        parent_name: municipality.name,
        parent_class: 'city'
    }

    if(metadata) {
        Object.assign(membership, metadata);
    }

    return membership;
}

function createOrgMembership(id, child, parent, metadata) {
    let membership = {
        id: id,
        role: 'Unidad Compradora',
        organization_id: child.id,
        organization_name: child.name,
        organization_class: child.classification[0],
        organization_subclass: child.subclassification[0],
        parent_id: parent.id,
        parent_name: parent.name,
        parent_class: parent.classification[0],
        parent_subclass: parent.subclassification[0]
    };

    if(metadata) {
        Object.assign(membership, metadata);
    }

    return membership;
}

function createPersonMembership(id, child, parent, metadata) {
    let membership = {
        id: id,
        role: 'Punto de Contacto',
        person_id: child.id,
        person_name: child.name,
        parent_id: parent.id,
        parent_name: parent.name,
        parent_class: parent.classification[0],
        parent_subclass: parent.subclassification[0]
    };

    if(metadata) {
        Object.assign(membership, metadata);
    }

    return membership;
}

function createPerson(party, metadata, type='', entities) {
    let person = {
        id: party.id,
        name: party.name,
        other_names: [],
        contract_count: {
            buyer: 0,
            supplier: 0
        },
        contract_amount: {
            buyer: 0,
            supplier: 0
        },
        purchase_count: {
            buyer: 0,
            supplier: 0,
            funder: 0
        },
        purchase_amount: {
            buyer: 0,
            supplier: 0,
            funder: 0
        }
    };

    if(type != '') {
        Object.assign(person, {
            classification: [type]
        });
    }

    let identifiers = [];
    if(party.hasOwnProperty('identifier')) {
        identifiers.push(party.identifier);
    }
    if(party.hasOwnProperty('additionalIdentifiers')) {
        identifiers.push(...party.additionalIdentifiers);
    }
    Object.assign(person, {
        identifiers: identifiers
    });

    let countryID = 'mx';
    let country = 'MX';
    let countryName = "México";
    if(party.hasOwnProperty('address') && party.address.hasOwnProperty('countryName')) {
        country = laundry.cleanCountry(party.address.countryName);
        countryID = laundry.simpleName(country);
        countryName = getCountryName(party.address.countryName);

        let countryIndex = findObjectInCollection(countryID, entities.states);
        if(!countryIndex) {
            let countryObj = createCountry(countryID, countryName, metadata);
            delete countryObj.contract_count;
            delete countryObj.contract_amount;
            delete countryObj.purchase_count;
            delete countryObj.purchase_amount;
            entities.states[countryID] = countryObj;
        }
    }
    let area = [{
        id: countryID,
        name: countryName,
        classification: ['country']
    }];
    Object.assign(person, { area: area });

    if(metadata) {
        Object.assign(person, metadata);
    }

    return person;
}

function getContractItemSummary(compiledRelease, items) {
    let count = 0;
    let amount = 0;

    if(compiledRelease.hasOwnProperty('contracts')) {
        compiledRelease.contracts.map( (contract) => {
            if(contract.hasOwnProperty('items')) {
                contract.items.map( item => {
                    let found = items.filter( i => i.id.replace(/\./g, '') == item.id.replace(/\./g, '') );
                    if(found.length > 0) {
                        count++;
                        amount += item.valueMxIMSS;
                    }
                } );
            }
            else {
                count++;
                amount += contract.value.amount;
            }
        } );
    }

    return [ count, amount ];
}

function getBuyerContractItemSummary(compiledRelease, contractIDs, items) {
    let count = 0;
    let amount = 0;

    if(compiledRelease.hasOwnProperty('contracts')) {
        compiledRelease.contracts.map( (contract) => {
            if( contractIDs.indexOf(contract.id) >= 0 ) {
                if(contract.hasOwnProperty('items')) {
                    contract.items.map( item => {
                        let found = items.filter( i => i.id.replace(/\./g, '') == item.id.replace(/\./g, '') );
                        if(found.length > 0) {
                            count++;
                            amount += item.valueMxIMSS;
                        }
                    } );
                }
                else {
                    count++;
                    amount += contract.value.amount;
                }
            }
        } );
    }

    return [ count, amount ];
}

function getSupplierContractSummary(id, compiledRelease) {
    let count = 0;
    let amount = 0;

    if(compiledRelease.hasOwnProperty('awards')) {
        compiledRelease.awards.map( (award) => {
            award.suppliers.map( supplier => {
                if(supplier.id == id) {
                    count++;
                    amount += award.value.amount
                }
            } )
        } );
    }

    return [ count, amount ];
}

function getBuyerContractSummary(id, contractIDs, compiledRelease) {
    let count = 0;
    let amount = 0;

    if(compiledRelease.hasOwnProperty('contracts')) {
        compiledRelease.contracts.map( (contract) => {
            if( contractIDs.indexOf(contract.id) >= 0 ) {
                count++;
                amount += contract.value.amount
            }
        } );
    }

    return [ count, amount ];
}

function findObjectInCollection(id, collection) {
    return collection.hasOwnProperty(id);
}

function getCountryName(code) {
    switch(code) {
        case 'AD': return 'Andorra';
        case 'AE': return 'Emiratos Árabes Unidos';
        case 'AM': return 'Armenia';
        case 'AR': return 'Argentina';
        case 'AT': return 'Austria';
        case 'AU': return 'Australia';
        case 'BE': return 'Bélgica';
        case 'BG': return 'Bulgaria';
        case 'BM': return 'Bermudas';
        case 'BR': return 'Brasil';
        case 'CA': return 'Canadá';
        case 'CH': return 'Suiza';
        case 'CL': return 'Chile';
        case 'CN': return 'China';
        case 'CO': return 'Colombia';
        case 'CR': return 'Costa Rica';
        case 'CU': return 'Cuba';
        case 'CZ': return 'República Checa';
        case 'DE': return 'Alemania';
        case 'DK': return 'Dinamarca';
        case 'DO': return 'República Dominicana';
        case 'DZ': return 'Argelia';
        case 'EC': return 'Ecuador';
        case 'EE': return 'Estonia';
        case 'EG': return 'Egipto';
        case 'ES': return 'España';
        case 'FI': return 'Finlandia';
        case 'FR': return 'Francia';
        case 'GB': return 'Reino Unido';
        case 'GE': return 'Georgia';
        case 'GR': return 'Grecia';
        case 'GT': return 'Guatemala';
        case 'HK': return 'Hong Kong';
        case 'HR': return 'Croacia';
        case 'HU': return 'Hungría';
        case 'IE': return 'Irlanda';
        case 'IL': return 'Israel';
        case 'IN': return 'India';
        case 'IO': return 'Territorio Británico del Océano Índico';
        case 'IS': return 'Islandia';
        case 'IT': return 'Italia';
        case 'JP': return 'Japón';
        case 'KE': return 'Kenya';
        case 'KR': return 'República de Corea';
        case 'LB': return 'Líbano';
        case 'LR': return 'Liberia';
        case 'LT': return 'Lituania';
        case 'MD': return 'Moldavia';
        case 'MT': return 'Malta';
        case 'MX': return 'México';
        case 'MY': return 'Malasia';
        case 'NG': return 'Nigeria';
        case 'NL': return 'Países Bajos';
        case 'NO': return 'Noruega';
        case 'NZ': return 'Nueva Zelanda';
        case 'PA': return 'Panamá';
        case 'PE': return 'Perú';
        case 'PL': return 'Polonia';
        case 'PR': return 'Puerto Rico';
        case 'PT': return 'Portugal';
        case 'RE': return 'Reunión';
        case 'RS': return 'Serbia';
        case 'RU': return 'Rusia';
        case 'SE': return 'Suecia';
        case 'SG': return 'Singapur';
        case 'SI': return 'Eslovenia';
        case 'SL': return 'Sierra Leona';
        case 'SV': return 'El Salvador';
        case 'SZ': return 'Swazilandia';
        case 'TR': return 'Turquía';
        case 'TW': return 'Taiwan';
        case 'UA': return 'Ucrania';
        case 'UG': return 'Uganda';
        case 'US': return 'Estados Unidos';
        case 'UY': return 'Uruguay';
        case 'VE': return 'Venezuela';
        case 'VI': return 'Islas Vírgenes de los Estados Unidos';
        case 'YT': return 'Mayotte';
        case 'ZA': return 'Sudáfrica';
        default: return code;
    }
}

module.exports = extractEntities;
