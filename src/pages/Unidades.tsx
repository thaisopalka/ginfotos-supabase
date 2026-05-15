import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

interface Unidade {
  id: string;
  name: string;
  address?: string | null;
}

export default function Unidades() {
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchUnidades();
  }, []);

  const fetchUnidades = async () => {
    const { data, error } = await supabase.from('unidades').select('*').order('name');
    if (!error && data) {
      setUnidades(data as Unidade[]);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const { error } = await supabase.from('unidades').insert([{ name, address }]);
    if (error) {
      setMessage(`Falha ao salvar unidade: ${error.message}`);
    } else {
      setMessage('Unidade adicionada com sucesso.');
      setName('');
      setAddress('');
      fetchUnidades();
    }
  };

  return (
    <div>
      <div className="page-card">
        <h1 className="page-title">UNIDADES ESCOLARES</h1>
        <p className="page-description">Gerencie unidades e locais de visitação.</p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input placeholder="Buscar unidades" value={query} onChange={(e) => setQuery(e.target.value)} />
          <button className="primary" type="button" onClick={() => { setName(''); setAddress(''); }}>
            NOVA UNIDADE
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="name">Nome da Unidade</label>
            <input id="name" value={name} onChange={(event) => setName(event.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="address">Endereço</label>
            <input id="address" value={address} onChange={(event) => setAddress(event.target.value)} />
          </div>
            <button className="primary" type="submit">NOVA UNIDADE</button>
        </form>
        {message && <p className="notice">{message}</p>}
      </div>

      <div className="page-card">
        <h2>Lista de Unidades</h2>
        <table className="table-list">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Endereço</th>
            </tr>
          </thead>
          <tbody>
            {unidades.filter(u => u.name.toLowerCase().includes(query.toLowerCase())).map((item) => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td>{item.address || 'Não informado'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
