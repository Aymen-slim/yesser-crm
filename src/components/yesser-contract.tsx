"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { CONTRACT_PACKS, encodeSchedule, parseSchedule, type ContractBlanks, type ScheduleRow } from "@/lib/contract";

export function YesserContract({
  weddingId,
  initial,
  saveAction,
}: {
  weddingId: string;
  initial: ContractBlanks;
  saveAction: (formData: FormData) => void | Promise<void>;
}) {
  const [fields, setFields] = useState(initial);
  const [rows, setRows] = useState<ScheduleRow[]>(() => parseSchedule(initial.schedule));
  const set = (key: keyof ContractBlanks) => (value: string) => setFields((current) => ({ ...current, [key]: value }));
  const schedule = encodeSchedule(rows);
  const eventDate = rows.map((row) => row.date.trim()).filter(Boolean).join(" · ");
  const placeList = rows.map((row) => row.place.trim()).filter(Boolean).join(" · ");

  return (
    <form id="yesser-contract" action={saveAction}>
      <style>{`
        .yesser-contract {
          font-family: Helvetica, Arial, sans-serif;
          color: #000;
          font-size: 11px;
          line-height: 1.35;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .yesser-contract h1, .yesser-contract h2, .yesser-contract p { margin: 0; }
        .yesser-contract h2 { margin-top: 13px; margin-bottom: 4px; font-size: 12.5px; font-weight: 700; }
        .yesser-contract input.blank {
          all: unset;
          display: inline-block;
          box-sizing: border-box;
          max-width: 100%;
          border-bottom: 1px solid #000;
          font: inherit;
          color: #000;
          line-height: 1.2;
          padding: 0 2px;
        }
        .yesser-contract input.blank:focus, .yesser-contract textarea.cell:focus, .yesser-contract input.cell:focus { outline: 1px solid #111; outline-offset: 1px; }
        .yesser-contract textarea.cell, .yesser-contract input.cell {
          all: unset;
          display: block;
          box-sizing: border-box;
          width: 100%;
          font: inherit;
          color: #000;
          white-space: pre-wrap;
          resize: none;
        }
        .yesser-contract .pack-table { table-layout: fixed; }
        .yesser-contract .pack-table th:first-child { width: 28%; }
        .yesser-contract .auto-cell { position: relative; min-width: 0; }
        .yesser-contract .cell-size { display: block; visibility: hidden; min-height: 1.35em; white-space: pre-wrap; overflow-wrap: anywhere; }
        .yesser-contract .cell-size::after { content: " "; white-space: pre; }
        .yesser-contract .auto-cell textarea.cell { position: absolute; inset: 0; height: 100%; min-height: 0; overflow: hidden; overflow-wrap: anywhere; line-height: 1.35; }
        .yesser-contract table { width: 100%; border-collapse: collapse; margin: 8px 0 10px; font-size: 11px; }
        .yesser-contract th, .yesser-contract td {
          border: 1px solid #808080;
          padding: 5px 7px;
          vertical-align: top;
          text-align: left;
          background: #fff;
          font-weight: 400;
        }
        .yesser-contract th { background: #f2eeec; font-weight: 700; }
        .yesser-contract td.pack-name { width: 28%; font-weight: 700; }
        .yesser-contract td.pack-price, .yesser-contract th.pack-price { width: 72px; white-space: nowrap; font-weight: 700; }
        .yesser-contract .tick {
          display: inline-block;
          width: 9px;
          height: 9px;
          margin-right: 4px;
          border: 1px solid #000;
          vertical-align: -1px;
          text-align: center;
          font-size: 8px;
          line-height: 8px;
        }
        .yesser-contract .sign-line {
          display: inline-block;
          min-width: 220px;
          border-bottom: 1px solid #000;
        }
        .yesser-contract .page-two { break-before: page; }
        .yesser-contract button {
          all: unset;
          cursor: pointer;
          font: inherit;
          font-size: 11px;
          text-decoration: underline;
        }
        .yesser-contract button:disabled { opacity: 0.35; cursor: default; text-decoration: none; }
        @page { size: A4; margin: 0; }
        @media print {
          .yesser-contract { padding: 14mm 16mm; }
          .yesser-contract .page-two { padding-top: 14mm; }
          .yesser-contract input.blank:focus, .yesser-contract textarea.cell:focus, .yesser-contract input.cell:focus { outline: none; }
          .yesser-contract .no-print, .yesser-contract .auto-cell textarea.cell { display: none; }
          .yesser-contract .cell-size { visibility: visible; }
          .yesser-contract tr { break-inside: avoid; }
        }
      `}</style>
      <article className="yesser-contract mx-auto max-w-[210mm] bg-white px-4 py-6 text-black sm:px-[16mm] sm:py-[14mm] shadow-[0_8px_30px_rgba(0,0,0,0.06)] print:max-w-none print:px-0 print:py-0 print:shadow-none">
        <input type="hidden" name="wedding_id" value={weddingId} />
        <input type="hidden" name="schedule" value={schedule} />
        <input type="hidden" name="event_date" value={eventDate.slice(0, 800)} />
        <input type="hidden" name="places" value={placeList.slice(0, 2000)} />
        {fields.pack === "" ? <input type="hidden" name="pack" value="" /> : null}

        <header className="mb-4 text-center">
          <p className="text-[20px] leading-none font-bold">Yesser Barka</p>
          <p className="mt-1.5 text-[8.5pt] tracking-[0.16em]">WEDDING PHOTOGRAPHY</p>
          <h1 className="mt-4 text-[15px] font-bold">CONTRAT DE PRESTATIONS</h1>
          <p className="mt-1 text-[8.5pt]">Photographie & vidéographie de mariage — Saison 2027</p>
        </header>

        <h2>1. PARTIES AU CONTRAT</h2>
        <p>
          <strong>Le Prestataire :</strong> Yesser Barka — Yesser Barka Photography
        </p>
        <p>MF : 1904248H</p>
        <p>Sousse, Tunisie</p>
        <p>Tél. : +216 24 24 36 15</p>
        <p>E-mail : Yesserbarkaa@gmail.com</p>
        <p className="mt-2">
          <strong>Les Clients / Mariés :</strong>{" "}
          <Blank name="client_names" value={fields.client_names} onChange={set("client_names")} size={42} maxLength={200} />
        </p>
        <p>
          Téléphone / E-mail :{" "}
          <Blank name="contact" value={fields.contact} onChange={set("contact")} size={42} maxLength={200} />
        </p>
        <p>
          Adresse : <Blank name="address" value={fields.address} onChange={set("address")} size={48} maxLength={240} />
        </p>

        <h2>2. OBJET DU CONTRAT</h2>
        <p>
          Le présent contrat définit les conditions dans lesquelles le Prestataire réalise les prestations de photographie et/ou de vidéographie du mariage des Clients, selon le forfait choisi et les éventuelles prestations supplémentaires indiquées au présent contrat.
        </p>

        <h2>3. DATES, LIEUX ET HORAIRES</h2>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Lieu</th>
              <th className="no-print w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                <td>
                  <input
                    className="cell"
                    value={row.date}
                    maxLength={120}
                    aria-label="Date"
                    onChange={(event) =>
                      setRows((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, date: event.target.value } : item)))
                    }
                  />
                </td>
                <td>
                  <input
                    className="cell"
                    value={row.place}
                    maxLength={240}
                    aria-label="Lieu"
                    onChange={(event) =>
                      setRows((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, place: event.target.value } : item)))
                    }
                  />
                </td>
                <td className="no-print">
                  <button
                    type="button"
                    className="ghost"
                    disabled={rows.length === 1}
                    onClick={() => setRows((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="no-print">
          <button type="button" className="ghost" onClick={() => setRows((current) => [...current, { date: "", place: "" }])}>
            Ajouter une date et un lieu
          </button>
        </p>
        <p>
          Heure de début : <Blank name="start_time" value={fields.start_time} onChange={set("start_time")} size={10} maxLength={20} /> Heure de fin :{" "}
          <Blank name="end_time" value={fields.end_time} onChange={set("end_time")} size={10} maxLength={20} />
        </p>
        <p>
          Préparatifs : <Blank name="preparations" value={fields.preparations} onChange={set("preparations")} size={48} maxLength={400} />
        </p>
        <p className="mt-2">
          Tout changement de lieu, d’horaire ou de déroulement devra être communiqué au Prestataire dans les meilleurs délais. Le Prestataire ne pourra être tenu responsable des prestations non réalisées en raison d’un changement non communiqué, d’un retard important ou de circonstances indépendantes de sa volonté.
        </p>

        <h2>4. FORFAIT CHOISI</h2>
        <table className="pack-table">
          <thead>
            <tr>
              <th>Forfait</th>
              <th>Prestations</th>
              <th className="pack-price">Tarif</th>
            </tr>
          </thead>
          <tbody>
            {CONTRACT_PACKS.map((pack) => {
              const nameKey = `pack${pack.id}_name` as const;
              const linesKey = `pack${pack.id}_lines` as const;
              const priceKey = `pack${pack.id}_price` as const;
              return (
                <tr key={pack.id}>
                  <td className="pack-name">
                    <AutoCell name={nameKey} label={`Forfait ${pack.id}`} maxLength={120} value={fields[nameKey]} onChange={set(nameKey)} />
                  </td>
                  <td>
                    <AutoCell name={linesKey} label={`Prestations du forfait ${pack.id}`} maxLength={1500} value={fields[linesKey]} onChange={set(linesKey)} />
                  </td>
                  <td className="pack-price">
                    <AutoCell name={priceKey} label={`Tarif du forfait ${pack.id}`} maxLength={40} value={fields[priceKey]} onChange={set(priceKey)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p>
          Forfait choisi :{" "}
          {CONTRACT_PACKS.map((pack) => (
            <label key={pack.id} className="mr-3 inline-flex items-center">
              <input
                type="radio"
                name="pack"
                value={pack.id}
                checked={fields.pack === pack.id}
                onChange={() => set("pack")(pack.id)}
                className="sr-only"
              />
              <span className="tick" aria-hidden="true">
                {fields.pack === pack.id ? "✓" : ""}
              </span>
              {pack.choice}
            </label>
          ))}
        </p>
        <p>
          Prestations / extras éventuels : <Blank name="extras" value={fields.extras} onChange={set("extras")} size={42} maxLength={500} />
        </p>
        <p>
          Montant total convenu : <Blank name="total" value={fields.total} onChange={set("total")} size={14} maxLength={40} /> DT
        </p>

        <h2>5. PAIEMENT ET CONFIRMATION DE LA DATE</h2>
        <p>
          Acompte à la signature : <Blank name="deposit" value={fields.deposit} onChange={set("deposit")} size={10} maxLength={40} /> DT. Solde :{" "}
          <Blank name="balance" value={fields.balance} onChange={set("balance")} size={10} maxLength={40} /> DT, à régler au plus tard avant le début de la prestation le jour du mariage. La date n’est définitivement réservée qu’après signature du contrat et réception de l’acompte. Sauf accord écrit contraire, l’acompte versé à la réservation n’est pas remboursable en cas d’annulation par les Clients.
        </p>

        <div className="page-two">
          <h2>6. LIVRAISON DES PHOTOGRAPHIES ET VIDÉOS</h2>
          <p>
            Les photographies finales sont livrées via une galerie en ligne privée, dans un délai indicatif de 1 à 2 mois après le mariage. Le délai peut varier selon la période, le volume de travail et les circonstances exceptionnelles. Les prestations vidéo peuvent avoir un délai de livraison différent. Les Clients sont responsables du téléchargement et de la sauvegarde de leurs fichiers.
          </p>

          <h2>7. SÉLECTION DES PHOTOS POUR TIRAGES ET PHOTOBOOK</h2>
          <p>
            À compter de la mise à disposition de la galerie photo en ligne, les Clients disposent de <strong>DEUX (2) MOIS</strong> pour effectuer et transmettre leur sélection des photos destinées aux tirages et/ou au photobook. <strong>La sélection relève de la responsabilité</strong> des Clients. Passé ce délai, et en l’absence de sélection communiquée, le Prestataire pourra ne pas être en mesure de réaliser les tirages et/ou le photobook inclus dans le forfait. Le délai de deux (2) mois constitue le délai maximum pour bénéficier de ces prestations incluses. Tout retard de sélection peut entraîner un retard de production.
          </p>

          <h2>8. HEURES SUPPLÉMENTAIRES ET PRESTATIONS NON PRÉVUES</h2>
          <p>
            Toute heure supplémentaire ou prestation non incluse fera l’objet d’un accord préalable et pourra être facturée en supplément selon le tarif communiqué. Les retards des Clients, invités, lieux ou autres intervenants ne donnent pas automatiquement lieu à une prolongation gratuite.
          </p>

          <h2>9. CONSERVATION DES FICHIERS</h2>
          <p>
            Le Prestataire conserve les fichiers livrés pendant une durée maximale de 12 mois à compter de la mise à disposition de la galerie. Au-delà, il ne pourra être tenu responsable de leur conservation ou récupération.
          </p>

          <h2>10. ANNULATION ET EMPÊCHEMENT DU PRESTATAIRE</h2>
          <p>
            En cas d’annulation par les Clients, les sommes déjà versées restent acquises au Prestataire, sauf accord écrit contraire. En cas d’empêchement majeur du Prestataire, une solution de remplacement sera proposée dans la mesure du possible ; à défaut, les sommes versées pour les prestations non réalisées seront remboursées.
          </p>

          <h2>11. FORCE MAJEURE</h2>
          <p>
            Aucune des parties ne pourra être tenue responsable d’un manquement résultant d’un événement imprévisible et indépendant de sa volonté empêchant ou perturbant l’exécution de la prestation. Les parties rechercheront une solution raisonnable lorsque cela est possible.
          </p>

          <h2>12. STYLE ARTISTIQUE ET RETOUCHE</h2>
          <p>
            Les Clients reconnaissent avoir pris connaissance du style photographique et vidéo du Prestataire. La sélection des images, le cadrage, le traitement colorimétrique et la retouche sont réalisés selon sa direction artistique. Les retouches supplémentaires non prévues peuvent être facturées après accord.
          </p>

          <h2>13. DROIT D’UTILISATION DES IMAGES</h2>
          <p>
            Sauf demande écrite contraire avant publication, les Clients autorisent le Prestataire à utiliser une sélection des photographies réalisées pour présenter son travail, notamment sur son site internet, ses réseaux sociaux, son portfolio et ses supports professionnels.
          </p>

          <h2>14. RESPONSABILITÉ ET CONDITIONS DE PRISE DE VUE</h2>
          <p>
            Le Prestataire met en œuvre les moyens raisonnables pour assurer la qualité et la continuité de la prestation. Il ne pourra être tenu responsable d’une impossibilité de prise de vue résultant notamment de restrictions du lieu, des autorités, de la météo, de l’intervention d’un tiers ou d’un événement indépendant de sa volonté.
          </p>

          <h2>15. ACCORD DES PARTIES</h2>
          <p>
            La signature du présent contrat vaut acceptation de l’ensemble des conditions qui y sont mentionnées. Toute modification importante devra être convenue par écrit.
          </p>

          <h2>16. SIGNATURES</h2>
          <p>
            Fait à <Blank name="signed_place" value={fields.signed_place} onChange={set("signed_place")} size={24} maxLength={80} />, le{" "}
            <Blank name="signed_day" value={fields.signed_day} onChange={set("signed_day")} size={2} maxLength={2} /> /{" "}
            <Blank name="signed_month" value={fields.signed_month} onChange={set("signed_month")} size={2} maxLength={2} /> / 2027
          </p>
          <p className="mt-4">
            Le Prestataire — Yesser Barka Photography : <span className="sign-line" />
          </p>
          <p className="mt-4">
            Les Clients / Mariés : <span className="sign-line" />
          </p>
        </div>
      </article>
    </form>
  );
}

function AutoCell({
  name,
  label,
  value,
  onChange,
  maxLength,
}: {
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
}) {
  return (
    <div className="auto-cell">
      <span className="cell-size" aria-hidden="true">{value || " "}</span>
      <textarea className="cell" name={name} aria-label={label} rows={1} maxLength={maxLength} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function Blank({
  name,
  value,
  onChange,
  size,
  maxLength,
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
  size: number;
  maxLength: number;
}) {
  const width = Math.max(size, value.length + 1);
  return (
    <input
      className="blank"
      name={name}
      value={value}
      maxLength={maxLength}
      style={{ width: `${width}ch` }}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

export function ContractResetButton({ label, message }: { label: string; message: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="ghost"
      disabled={pending}
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      {pending ? "…" : label}
    </button>
  );
}
