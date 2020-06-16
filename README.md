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
    --classifiers -x    Listado de rutas a archivos CSV que contienen nombres de entidades preclasificadas a "person" o "company"

## Listados clasificadores

Con la opción **-x --classifiers** es posible especificar una preclasificación para las entidades que existen dentro de los records OCDS.

Los archivos a los que se hace referencia con este argumento deben contener la siguiente estructura columnar

    0: Nombre de la entidad (string)
    1: Clasificación (string: "person" o "company")

## Listados unificadores

// TODO...
