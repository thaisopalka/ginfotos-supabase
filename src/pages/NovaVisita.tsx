import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { UserProfile } from '../App';
import PhotoUpload from '../components/PhotoUpload';

interface UnidadeOption {
  id: string;
  name: string;
}

interface NovaVisitaProps {
  profile: UserProfile | null;
}

interface VisitaRecord {
  id: string;
  visitor_name: string;
}

export default function NovaVisita({ profile }: NovaVisitaProps) {
  const [unidades, setUnidades] = useState<UnidadeOption[]>([]);
  const [visitorName, setVisitorName] = useState('');
  const [notes, setNotes] = useState('');
  const [unidadeId, setUnidadeId] = useState('');
  const [visitDate, setVisitDate] = useState(new Date().toISOString().slice(0, 10));
  const [message, setMessage] = useState('');
  const [visit, setVisit] = useState<VisitaRecord | null>(null);

  useEffect(() => {
    async function loadUnidades() {
      const { data } = await supabase.from('unidades').select('id, name').order('name');
      if (data) {
        setUnidades(data as UnidadeOption[]);
        if (data.length > 0) {
          setUnidadeId((data as UnidadeOption[])[0].id);
        }
      }
    }
    loadUnidades();
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!profile) {
      setMessage('Usuário não encontrado. Faça login novamente.');
      return;
    }
    const { data, error } = await supabase.from('visitas').insert([
      {
        visitor_name: visitorName,
        unidade_id: unidadeId,
        visit_date: visitDate,
        notes,
        created_by: profile.id
      }
    ]).select('id, visitor_name').single();

    if (error) {
      setMessage(`Erro ao criar visita: ${error.message}`);
      return;
    }

    if (data) {
      setVisit(data);
      setMessage('Visita criada com sucesso! Você já pode enviar fotos para esta visita.');
      setVisitorName('');
      setNotes('');
    }
  };

  return (
    <div>
      <div className="page-card">
        <h1 className="page-title">Nova Visita</h1>
        <p className="page-description">Registre uma nova visita e faça upload de fotos no bucket designado.</p>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="visitorName">Nome do visitante</label>
            <input id="visitorName" value={visitorName} onChange={(event) => setVisitorName(event.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="unidade">Unidade</label>
            <select id="unidade" value={unidadeId} onChange={(event) => setUnidadeId(event.target.value)}>
              {unidades.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="visitDate">Data da visita</label>
            <input id="visitDate" type="date" value={visitDate} onChange={(event) => setVisitDate(event.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="notes">Observações</label>
            <textarea id="notes" value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} />
          </div>
          <button className="primary" type="submit">Salvar visita</button>
        </form>
        {message && <p className="notice">{message}</p>}
      </div>

      {visit && (
        <PhotoUpload visitId={visit.id} onUpload={() => setMessage('Upload concluído com sucesso.')} />
      )}
    </div>
  );
}
