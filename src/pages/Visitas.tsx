import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { UserProfile } from '../App';

interface Visita {
  id: string;
  visitor_name: string;
  unidade_id?: string | null;
  visit_date?: string | null;
  notes?: string | null;
  created_by?: string | null;
}

interface VisitasProps {
  profile: UserProfile | null;
}

export default function Visitas({ profile }: VisitasProps) {
  const [visitas, setVisitas] = useState<Visita[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadVisitas() {
      const { data } = await supabase.from('visitas').select('*').order('visit_date', { ascending: false });
      if (data) {
        setVisitas(data as Visita[]);
      }
      setLoading(false);
    }
    loadVisitas();
  }, []);

  return (
    <div className="page-card">
      <h1 className="page-title">Visitas</h1>
      <p className="page-description">Lista de visitas registradas e detalhes de cada registro.</p>
      {loading ? (
        <p>Carregando visitas...</p>
      ) : (
        <table className="table-list">
          <thead>
            <tr>
              <th>Visitante</th>
              <th>Unidade</th>
              <th>Data</th>
              <th>Observações</th>
              <th>Criado por</th>
            </tr>
          </thead>
          <tbody>
            {visitas.map((item) => (
              <tr key={item.id}>
                <td>{item.visitor_name}</td>
                <td>{item.unidade_id || 'Não informado'}</td>
                <td>{item.visit_date || 'Não informado'}</td>
                <td>{item.notes || '—'}</td>
                <td>{item.created_by === profile?.id ? 'Você' : item.created_by || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
