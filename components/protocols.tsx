"use client";

import { useState } from "react";
import {
  Droplets,
  Snowflake,
  Bug,
  Waves,
  ArrowUpRight,
  Check,
  BookOpen,
} from "lucide-react";
import { Modal, Badge } from "./ui";

const protocols = [
  {
    icon: Droplets,
    number: "01",
    tag: "EN CAMPO",
    title: "Riego",
    text: "Control de la humedad y frecuencia de riego.",
    steps: [
      "Evalúa la humedad del suelo antes de regar; evita decidir solo por la apariencia de las hojas.",
      "Ajusta frecuencia y volumen según textura del suelo, etapa del cultivo y clima local.",
      "Revisa emisores y uniformidad; evita encharcamiento y cambios bruscos de humedad.",
      "Registra el riego y verifica la respuesta del cultivo.",
    ],
    color: "blue",
  },
  {
    icon: Snowflake,
    number: "02",
    tag: "POSCOSECHA",
    title: "Conservación en frío",
    text: "Condiciones de almacenamiento tras la cosecha.",
    steps: [
      "Lleva las hortalizas a sombra tras la cosecha y reduce demoras antes del enfriamiento.",
      "Define temperatura y humedad según cultivo, presentación y destino comercial.",
      "Usa envases limpios y ventilados; evita aplastamiento.",
      "Registra temperatura y tiempos durante almacenamiento y transporte.",
    ],
    color: "purple",
  },
  {
    icon: Bug,
    number: "03",
    tag: "PREVENCIÓN",
    title: "Manejo de plagas",
    text: "Revisión de síntomas y prevención de daños.",
    steps: [
      "Inspecciona hojas por ambas caras y revisa diferentes puntos del lote.",
      "Registra el daño y solicita identificación antes de elegir un tratamiento.",
      "Prioriza higiene, rotación de cultivos y medidas culturales adecuadas.",
      "Aplica únicamente productos autorizados siguiendo etiqueta y asesoría técnica local.",
    ],
    color: "amber",
  },
  {
    icon: Waves,
    number: "04",
    tag: "INOCUIDAD",
    title: "Lavado poscosecha",
    text: "Limpieza y manipulación después de la cosecha.",
    steps: [
      "Utiliza agua de calidad apta para el proceso y equipos limpios.",
      "Separa hortalizas dañadas y retira tierra antes del lavado.",
      "Cuando se requiera desinfección, sigue el protocolo validado y la etiqueta del producto.",
      "Evita contaminación cruzada; escurre y conserva según las necesidades del cultivo.",
    ],
    color: "green",
  },
];

export default function Protocols() {
  const [selected, setSelected] = useState<number | null>(null);

  return (
    <>
      <div className="section-heading">
        <div>
          <h2>Buenas prácticas de cultivo</h2>
          <p>Recomendaciones para el manejo y la poscosecha.</p>
        </div>
        <Badge tone="gray">
          <BookOpen size={14} />4 protocolos
        </Badge>
      </div>

      <div className="protocol-grid">
        {protocols.map((p, i) => (
          <button
            className={`protocol-card ${p.color}`}
            key={p.title}
            onClick={() => setSelected(i)}
          >
            <div className="protocol-top">
              <span className="protocol-icon">
                <p.icon size={29} />
              </span>
              <span>{p.number}</span>
            </div>
            <span className="eyebrow">{p.tag}</span>
            <h2>{p.title}</h2>
            <p>{p.text}</p>
            <div className="protocol-bottom">
              Ver protocolo <ArrowUpRight size={20} />
            </div>
          </button>
        ))}
      </div>

      <div className="practice-note">
        <LeafMark />
        <div>
          <h3>Verificación en campo</h3>
          <p>
            Adapta las recomendaciones a las condiciones del cultivo.
            El análisis de imágenes complementa la observación directa.
          </p>
        </div>
      </div>

      {selected !== null && (
        <Modal
          title={protocols[selected].title}
          onClose={() => setSelected(null)}
        >
          <p className="modal-subtitle">{protocols[selected].text}</p>
          <ol className="protocol-steps">
            {protocols[selected].steps.map((s, i) => (
              <li key={s}>
                <span>{i + 1}</span>
                <p>{s}</p>
              </li>
            ))}
          </ol>
          <p className="detail-copy">
            Estas recomendaciones son generales y deben adaptarse a las condiciones del cultivo.
          </p>
          <button className="button primary" onClick={() => setSelected(null)}>
            <Check size={17} />
            Entendido
          </button>
        </Modal>
      )}
    </>
  );
}

function LeafMark() {
  return (
    <div className="practice-icon">
      <BookOpen size={27} />
    </div>
  );
}
