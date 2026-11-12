# **📘 Documentación Maestra: AnimeOrganizerAI**

**Versión:** 1.0.0

**Estado:** Diseño Arquitectónico Finalizado

**Entorno Objetivo:** Linux (CachyOS)

**Stack Principal:** Python 3.11+, systemd, inotify (watchdog), SQLite, APIs de metadatos.

## **📑 Índice Maestro**

1. [Visión y Filosofía del Sistema](#bookmark=id.dlj6qla2e1hi)  
2. [Arquitectura General](#bookmark=id.lo2heqoe53j)  
3. [Estructura de Configuración Centralizada](#bookmark=id.ni3rwy7ak1in)  
4. [Especificación de Módulos (Fase 1\)](#bookmark=id.pb1bb730jcr2)  
   * 4.1. Watcher Daemon (Observador)  
   * 4.2. AI Analyzer (Motor de Identificación)  
   * 4.3. Organizer Core (Motor de Movimiento)  
   * 4.4. Sistema de Logging y Auditoría  
5. [Contrato de Adquisición (Fase 2\)](#bookmark=id.lmnhpfq741xd)  
6. [Biblioteca Inteligente (Fase 3\)](#bookmark=id.wfllqb2idiwh)  
7. [Gestión de Errores y Casos Límite](#bookmark=id.6ovr9d82ogw5)  
8. [Plan de Pruebas (Testing)](#bookmark=id.ye351l5pqelc)  
9. [Despliegue y systemd](#bookmark=id.gcxopjfcrs8p)

## **1\. Visión y Filosofía del Sistema**

**AnimeOrganizerAI** no es un script de ordenamiento; es un demonio de sistema resiliente. Su propósito es mantener el orden absoluto en una biblioteca multimedia, actuando como un embudo unidireccional desde el caos (descargas) hacia el orden (biblioteca).

### **Principios Fundacionales (Reglas Estrictas para el Desarrollo)**

1. **Idempotencia:** Ejecutar el sistema sobre el mismo archivo múltiples veces debe tener exactamente el mismo resultado que ejecutarlo una vez.  
2. **Cero Destrucción (Regla de Oro):** Bajo ninguna circunstancia el código usará funciones de sobrescritura automática (ej. evitar shutil.move sin comprobación previa). Si el archivo de destino existe, la operación se cancela y se notifica.  
3. **Inmutabilidad en la Duda:** Si el sistema (mediante RegEx o IA) no alcanza un umbral de confianza del 95% sobre la identidad de un archivo, el archivo se mueve a una carpeta /Revision\_Manual/. Nunca adivina a ciegas.  
4. **Desacoplamiento Absoluto:** El organizador no sabe cómo se descargan los archivos. Solo reacciona a eventos del sistema de archivos.

## **2\. Arquitectura General**

El sistema utiliza un **Pipeline de Procesamiento Unidireccional Basado en Eventos**.

### **Diagrama de Flujo de Datos (Textual)**

\[Filesystem: Inotify Event\] \--\> (1. Watcher)   
                                     |  
                                     v  
                           \[Cola de Procesamiento\]  
                                     |  
                                     v  
(API REST / LLM) \<----------- (2. AI Analyzer)  
                                     |  
                                     v  
                           \[Metadatos Estructurados\]  
                                     |  
                                     v  
                              (3. Organizer) \--------\> \[Filesystem: /mnt/hdd/anime/\]  
                                     |  
                                     v  
                                (4. Logger) \---------\> \[SQLite / Journald\]

### **Rutas Base**

* **Entrada (Dropzone):** /home/jaimegonzalez/Escritorio/Para\_Organizar/  
* **Cuarentena (Dudas/Errores):** /home/jaimegonzalez/Escritorio/Para\_Organizar/Revision\_Manual/  
* **Destino (Biblioteca):** /mnt/hdd/anime/  
* **Logs y Estado:** \~/.local/share/AnimeOrganizerAI/

## **3\. Estructura de Configuración Centralizada**

El sistema dependerá de un único archivo de configuración config.yaml. No habrá rutas *hardcodeadas* (quemadas) en el código.

**config.yaml (Definición del Contrato):**

system:  
  log\_level: "INFO"  
  workers: 4 \# Hilos de procesamiento simultáneo

paths:  
  input: "/home/jaimegonzalez/Escritorio/Para\_Organizar/"  
  library: "/mnt/hdd/anime/"  
  quarantine: "/home/jaimegonzalez/Escritorio/Para\_Organizar/Revision\_Manual/"

analyzer:  
  ai\_provider: "gemini" \# o openai, local\_llm  
  confidence\_threshold: 0.90  
  api\_key\_env\_var: "ANIME\_AI\_API\_KEY"

organizer:  
  folder\_template: "{anime\_title}/Season {season:02d}/"  
  file\_template: "{anime\_title} \- Episodio {episode:04d}{extension}"  
  allowed\_extensions: \[".mkv", ".mp4", ".avi", ".ass", ".srt"\]

## **4\. Especificación de Módulos (Fase 1\)**

### **4.1. Watcher Daemon (Observador)**

Este módulo es la entrada del sistema. En CachyOS (Linux), el polling (bucle while comprobando archivos) es ineficiente.

* **Tecnología:** Uso de la librería watchdog de Python, que hace de interfaz para inotify del kernel de Linux.  
* **Problema Común:** Un archivo masivo (1.5GB) dispara eventos de "creación" antes de terminar de copiarse. Si el sistema lo lee a la mitad, fallará o se corromperá.  
* **Solución Arquitectónica:**  
  1. Ignorar eventos IN\_CREATE.  
  2. Reaccionar **únicamente** a eventos IN\_CLOSE\_WRITE (archivo cerrado tras escritura).  
  3. Comprobar que la extensión está en allowed\_extensions.  
  4. Los archivos ignorados (ej. .part) no generan acción.

### **4.2. AI Analyzer (Motor de Identificación)**

El módulo más delicado. Convierte nombres basura como \[SubsPlease\] Boku no Hero Academia \- 114 (1080p) \[A3B1C\].mkv en metadatos limpios.

* **Flujo de Ejecución:**  
  1. **Limpieza Regex (Pre-procesamiento):** Se eliminan tags de release groups (ej. \[SubsPlease\], resoluciones 1080p, CRCs \[A3B1C\]).  
  2. **Inferencia (IA):** Se envía el nombre limpio al LLM.  
  3. **Contrato de Salida (JSON Schema):** La IA *debe* devolver un JSON estricto, no texto libre.

**Prompt Maestro para la IA (Debe estar incrustado en el código):**

Eres un experto catalogador de anime.   
Analiza el siguiente nombre de archivo: "{filename}"  
Devuelve ÚNICAMENTE un JSON con el siguiente esquema:  
{  
  "anime\_title": "Nombre oficial en Romaji o Inglés limpio",  
  "season": Número de temporada (entero, por defecto 1),  
  "episode": Número de episodio (entero),  
  "confidence": Valor de 0.0 a 1.0 indicando tu seguridad  
}

### **4.3. Organizer Core (Motor de Movimiento)**

Este módulo recibe la orden (Ruta Origen, Metadatos) y ejecuta cambios en el disco.

* **Algoritmo de Ejecución:**  
  1. Validar que la confianza (confidence) sea \>= confidence\_threshold. Si no, mover a quarantine.  
  2. Construir la ruta de destino interpolando los metadatos en el folder\_template y file\_template.  
  3. **Chequeo de Colisión:** if os.path.exists(ruta\_destino): raise DuplicatedFileError  
  4. Crear carpetas padre: os.makedirs(destino.parent, exist\_ok=True).  
  5. **Movimiento Atómico:** En Linux, si origen y destino están en el mismo disco, usar os.rename. Si están en discos distintos (SSD a HDD), usar shutil.copy2 seguido de os.remove(origen) para asegurar integridad.

### **4.4. Sistema de Logging y Auditoría**

Un proyecto mantenible necesita observabilidad total.

* Usar la librería estándar logging de Python.  
* **Rotación:** Log rotativo (máximo 10MB por archivo, 5 backups).  
* **Niveles:**  
  * INFO: "Archivo X identificado como Y y movido a Z".  
  * WARNING: "Confianza baja (0.7). Archivo X movido a Revisión Manual".  
  * ERROR: "Fallo al contactar API de IA", "El archivo ya existe en biblioteca".  
* **Integración OS:** La salida stderr será capturada nativamente por journald en CachyOS.

## **5\. Contrato de Adquisición (Fase 2\)**

Para asegurar que la Fase 2 sea completamente independiente, se define el siguiente **Contrato de Integración**:

El Organizador no expondrá ninguna API HTTP. El sistema de archivos actuará como el Bus de Eventos.

**Reglas para futuros clientes de descarga (Torrents, Scrapers):**

1. Deben descargar la data en la carpeta de entrada configurada.  
2. **Mientras se descarga**, el archivo debe tener una extensión temporal obligatoria: .part o .download. (Ej. Naruto\_01.mkv.part).  
3. El Watcher ignorará cualquier archivo con esas extensiones.  
4. **Una vez finalizada y verificada la descarga**, el cliente externo renombrará el archivo quitando la extensión .part. (Ej. Naruto\_01.mkv).  
5. Este renombrado atómico en Linux disparará instantáneamente el Watcher de la Fase 1\.

## **6\. Biblioteca Inteligente (Fase 3\)**

La evolución requiere persistencia de estado. No se puede confiar solo en leer la estructura de carpetas si hay miles de archivos.

* **Arquitectura:** Se integrará una base de datos local SQLite.  
* **Esquema Inicial (Diseño):**  
  * Tabla Series: id, title, total\_seasons, status.  
  * Tabla Episodes: id, series\_id, season, episode\_num, file\_path, hash\_md5, added\_at.  
* **Capacidades Futuras:**  
  * **Estadísticas:** Consultas SQL simples para saber tiempo total de visualización.  
  * **Duplicados Reales:** Comparar el hash\_md5 de archivos nuevos contra la BD. Si el hash ya existe, es un duplicado, incluso si el nombre es distinto.  
  * **Faltantes:** SELECT episode\_num ... WHERE episode\_num NO ESTA EN (lista de episodios en disco).

## **7\. Gestión de Errores y Casos Límite**

| Caso Límite (Edge Case) | Comportamiento del Sistema (Resolución) |
| :---- | :---- |
| API de IA caída / Sin Internet | Encolar el archivo. Reintento exponencial (1m, 5m, 15m, 1h). No descartar el archivo. |
| El archivo destino ya existe | Mover a quarantine agregando el sufijo \_DUPLICADO. Registrar Error. |
| Episodio doble (ej. 01-02) | La IA debe normalizar. El estándar será usar el primer número. Si falla, el umbral de confianza caerá y se enviará a quarantine. |
| Falta espacio en /mnt/hdd/ | Capturar OSError (No space left on device). Pausar el Watcher. Lanzar alerta crítica en logs. |
| Permisos insuficientes | Lanzar excepción al inicializar el demonio; fallar rápido (Fail Fast) antes de tocar archivos. |

## **8\. Plan de Pruebas**

No se acepta código sin pruebas. El entorno de testing simulará el sistema de archivos (Mocking).

* **Unitarias (Pytest):**  
  * test\_regex\_cleaner: Asegurar que \[Subs\] Name \- 01 se convierte en Name 01\.  
  * test\_path\_builder: Asegurar que la interpolación de texto genera rutas seguras sin caracteres ilegales en Linux (/, \\0).  
* **Integración:**  
  * test\_watcher\_ignores\_part\_files: Crear un .part, comprobar que la cola del procesador se mantiene en 0\. Renombrarlo, comprobar que la cola sube a 1\.  
* **Manejo del Sistema de Archivos:**  
  * Usar la librería pyfakefs para aislar las pruebas de los discos reales del sistema, evitando dañar archivos por accidente durante los tests.

## **9\. Despliegue y systemd**

Como se solicitó integración nativa con Linux (CachyOS), el software operará como un *User Service* o *System Service*.

**animeorganizer.service (Plantilla a implementar):**

\[Unit\]  
Description=AnimeOrganizerAI \- Daemon de organización automática  
After=network.target local-fs.target

\[Service\]  
Type=simple  
User=jaimegonzalez  
WorkingDirectory=/opt/AnimeOrganizerAI/  
ExecStart=/opt/AnimeOrganizerAI/venv/bin/python /opt/AnimeOrganizerAI/src/main.py  
Restart=on-failure  
RestartSec=10  
\# Limitar consumo de recursos para no afectar juegos o uso diario en CachyOS  
CPUWeight=40  
MemoryMax=512M

\[Install\]  
WantedBy=default.target

* **Comandos operativos:**  
  * systemctl \--user enable \--now animeorganizer  
  * journalctl \--user \-u animeorganizer \-f

**FIN DEL DOCUMENTO DE ESPECIFICACIÓN.**

*A partir de este documento, el equipo de desarrollo o el Agente de IA (Antigravity) tiene el contexto absoluto para comenzar la implementación de código y los tests unitarios.*