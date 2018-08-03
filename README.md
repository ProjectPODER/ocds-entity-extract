# OCDS Entity Extract

Este script toma como base una colección de Mongo con documentos en el formato OCDS y extrae las personas, organizaciones y entidades estatales.

## Ejemplo de uso

Desde el directorio raíz:

    node index.js -d quienesquienwiki -c contracts_ocds -y 2018

## Opciones

El script acepta las siguientes opciones como argumentos:

    --database -d       El nombre de la base de datos que contiene los contratos
    --collection -c     El nombre de la colección de documentos OCDS
    --year -y           El año de los contratos de los que se desea extraer las entidades
