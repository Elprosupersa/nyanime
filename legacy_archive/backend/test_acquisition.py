import logging
from src.acquisition.engine import AcquisitionEngine

# Configurar logging para ver la salida
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')

if __name__ == "__main__":
    engine = AcquisitionEngine(subscriptions_file="subscriptions.yaml")
    print("=== INICIANDO DRY RUN DEL MOTOR DE CASCADA ===")
    engine.run(dry_run=True)
    print("=== DRY RUN FINALIZADO ===")
