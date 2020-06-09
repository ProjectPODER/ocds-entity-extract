# OCDS Entity Extract

Este script toma como base una colección de Mongo con documentos en el formato OCDS y extrae las personas, organizaciones y entidades estatales.

## Ejemplo de uso

Desde el directorio raíz:

    node index.js -d BASE_DE_DATOS -c COLECCION

## Opciones

El script acepta las siguientes opciones como argumentos:

    --database -d       El nombre de la base de datos que contiene los contratos
    --collection -c     El nombre de la colección de documentos OCDS
    --host -h           Host para conectarse a MongoDB (si requiere autenticación, host es "user@pass:hostname")
    --port -p           Puerto para conectarse a MongoDB
    --test -t           Parámetro especial para realizar una prueba definida en el código
