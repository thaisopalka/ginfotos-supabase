import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

interface Pasta {
  id: string;
  name: string;
  description?: string | null;
}

export default function Pastas() {
  const [pastas, setPastas] = useState<Pasta[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchPastas();
  }, []);

  const fetchPastas = async () => {
    const { data } = await supabase.from('pastas').select('*').order('name');
    if (data) {
      setPastas(data as Pasta[]);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const { error } = await supabase.from('pastas').insert([{ name, description }]);
    if (error) {
      setMessage(`Falha ao salvar pasta: ${error.message}`);
    } else {
      setMessage('Pasta criada com sucesso.');
      setName('');
      setDescription('');
      fetchPastas();
    }
  };

  return (
    <div>
      <div className="page-card">
        <h1 className="page-title">Pastas</h1>
        <p className="page-description">Organize as pastas de informação para o processo de visitas.</p>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="name">Nome da Pasta</label>
            <input id="name" value={name} onChange={(event) => setName(event.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="description">Descrição</label>
            <textarea id="description" value={description} onChange={(event) => setDescription(event.target.value)} rows={4} />
          </div>
          <button className="primary" type="submit">Criar Pasta</button>
        </form>
        {message && <p className="notice">{message}</p>}
      </div>

      <div className="page-card">
        <h2>Lista de Pastas</h2>
        <table className="table-list">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Descrição</th>
            </tr>
          </thead>
          <tbody>
            {pastas.map((item) => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td>{item.description || 'Não informado'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
