/**
 * Web App DAWOS Embalagens - Lógica Interativa & Controle de Acessos
 * Recursos:
 * 1. Base de Usuários Atualizada (Alceu - Admin, Renan - Cliente)
 * 2. Animação de subida de cortina (sem costura central)
 * 3. Tela de escolha administrativa (Gerenciamento Geral vs Formação de Preço)
 * 4. Compartilhamento / Cópia de link de convite
 * 5. Calculadora de orçamentos responsiva em tempo real
 */

document.addEventListener('DOMContentLoaded', () => {
    // -------------------------------------------------------------
    // 1. BANCO DE DADOS LOCAL PERSISTIDO EM LOCALSTORAGE
    // -------------------------------------------------------------
    function getStoredData(key, defaultData) {
        const stored = localStorage.getItem(key);
        if (!stored) {
            localStorage.setItem(key, JSON.stringify(defaultData));
            return defaultData;
        }
        return JSON.parse(stored);
    }

    function saveStoredData(key, data) {
        localStorage.setItem(key, JSON.stringify(data));
    }

    // Salva a lista de usuários em DUAL CLOUD (Tabela + Backup KV) para garantir 100% de acesso em qualquer PC no mundo
    async function saveUsersToCloud(usersList) {
        if (!window.supabaseClient) return;
        try {
            for (let u of usersList) {
                await window.supabaseClient.from('xpace_users').upsert({
                    name: u.name,
                    username: (u.username || '').toLowerCase(),
                    password: u.password,
                    role: u.role,
                    company_id: 'DAWOS'
                }, { onConflict: 'username' });
            }
        } catch (e) {
            console.warn("Aviso ao salvar usuário individual:", e);
        }
        try {
            await window.supabaseClient.from('xpace_pricing_params').upsert({
                company_id: 'DAWOS_USER_LIST',
                outros: 0,
                mc_padrao: 0,
                user_json: JSON.stringify(usersList),
                updated_at: new Date()
            }, { onConflict: 'company_id' });
            console.log("☁️ Lista de Usuários sincronizada com sucesso na nuvem mundial!");
        } catch (e) {
            console.warn("Aviso ao salvar backup de usuários na nuvem:", e);
        }
    }

    // Sincronização em Nuvem Supabase para XPACEBOX
    async function syncSupabaseCloudData() {
        if (!window.supabaseClient) return;
        try {
            let localUsers = getStoredData('dawos_users', defaultUsers) || [];
            
            // 1. Busca da tabela xpace_users
            const { data: usersData } = await window.supabaseClient.from('xpace_users').select('*');
            if (usersData && usersData.length > 0) {
                usersData.forEach(cloudUser => {
                    if (!cloudUser.username) return;
                    const idx = localUsers.findIndex(u => (u.username || '').toLowerCase() === (cloudUser.username || '').toLowerCase());
                    if (idx >= 0) {
                        localUsers[idx] = {
                            name: cloudUser.name || localUsers[idx].name,
                            username: (cloudUser.username || localUsers[idx].username).toLowerCase(),
                            password: cloudUser.password || localUsers[idx].password,
                            role: cloudUser.role || localUsers[idx].role
                        };
                    } else {
                        localUsers.push({
                            name: cloudUser.name,
                            username: (cloudUser.username || '').toLowerCase(),
                            password: cloudUser.password,
                            role: cloudUser.role
                        });
                    }
                });
            }

            // 2. Busca do Backup em Nuvem Multi-Dispositivo
            const { data: backupData } = await window.supabaseClient.from('xpace_pricing_params').select('*').eq('company_id', 'DAWOS_USER_LIST');
            if (backupData && backupData.length > 0 && backupData[0].user_json) {
                try {
                    const parsed = JSON.parse(backupData[0].user_json);
                    if (Array.isArray(parsed)) {
                        parsed.forEach(bUser => {
                            if (!bUser.username) return;
                            const idx = localUsers.findIndex(u => (u.username || '').toLowerCase() === (bUser.username || '').toLowerCase());
                            if (idx >= 0) {
                                localUsers[idx] = bUser;
                            } else {
                                localUsers.push(bUser);
                            }
                        });
                    }
                } catch(e){}
            }

            users = localUsers;
            saveStoredData('dawos_users', users);
            if (typeof renderAdminCredentials === 'function') renderAdminCredentials();

            const { data: matsData } = await window.supabaseClient.from('xpace_materials').select('*');
            if (matsData && matsData.length > 0) {
                materials = matsData.map(m => ({
                    code: m.code,
                    name: m.name,
                    paperType: m.paper_type,
                    supplier: m.supplier,
                    grammage: m.grammage || '',
                    pressureRes: m.pressure_res || '',
                    thickness: m.thickness || '',
                    costIpi: parseFloat(m.cost_ipi) || 0
                }));
                window.dawosMaterials = materials;
                saveStoredData('dawos_materials', materials);
            }

            const { data: paramsData } = await window.supabaseClient.from('xpace_pricing_params').select('*').eq('company_id', 'DAWOS').single();
            if (paramsData) {
                const p = {
                    mcPadrao: parseFloat(paramsData.mc_padrao) || 40,
                    comissao: parseFloat(paramsData.comissao) || 2,
                    simples: parseFloat(paramsData.simples) || 5,
                    frete: parseFloat(paramsData.frete) || 2.27,
                    outros: parseFloat(paramsData.outros) || 1.7,
                    icmsDawos: parseFloat(paramsData.icms_dawos) || 12,
                    demais: parseFloat(paramsData.demais) || 8
                };
                localStorage.setItem('dawos_pricing_params', JSON.stringify(p));
                if (typeof window.dawosRecalcPreco === 'function') window.dawosRecalcPreco();
            }
        } catch(err) {
            console.warn("Supabase Sync:", err);
        }
    }

    const defaultUsers = [
        { name: 'Alceu', username: 'alceu', password: '@Amj20021979', role: 'admin' },
        { name: 'Renan', username: 'renan', password: 'Renan', role: 'cliente' },
        { name: 'Samantha', username: 'samantha', password: 'samantha', role: 'cliente' }
    ];

    // Versão dos dados: mudar este número força o reset do localStorage com os novos dados
    const DATA_VERSION = '2026-07-27-v15-CLEAN-PARAMS-RESET';

    const defaultSuppliers = ['COCELPA', 'EMPAR', 'FAPOLPA', 'KLABIN', 'NOVACKI', 'RIO BONITO', 'SOPASTA', 'TROMBINI', 'WESTROCK'];

    const defaultPaperClasses = [
        { code: 'OSRR-B',    desc: 'OSRR-B (ONDA SIMPLES - RECICLADO/RECICLADO)' },
        { code: 'OSKR-B',    desc: 'OSKR-B (ONDA SIMPLES - KRAFT/RECICLADO)' },
        { code: 'OSKK-B',    desc: 'OSKK-B (ONDA SIMPLES - KRAFT/KRAFT)' },
        { code: 'OSRK-B',    desc: 'OSRK-B (ONDA SIMPLES - RECICLADO/KRAFT)' },
        { code: 'OSBM-B',    desc: 'OSBM-B (ONDA SIMPLES - SEMI-KRAFT/MIOLO)' },
        { code: 'OSBKRES-B', desc: 'OSBKRES-B (ONDA SIMPLES - SEMI-KRAFT COM RESINA)' },
        { code: 'OSRT-T',    desc: 'OSRT-T (ONDA SIMPLES - RECICLADO/TESTLINER)' },
        { code: 'OSTT-T',    desc: 'OSTT-T (ONDA SIMPLES - TESTLINER/TESTLINER)' },
        { code: 'OSKK-C',    desc: 'OSKK-C (ONDA SIMPLES C - KRAFT/KRAFT)' },
        { code: 'OCKK-C',    desc: 'OCKK-C (ONDA SIMPLES C - KRAFT/KRAFT)' },
        { code: 'OCRR-C',    desc: 'OCRR-C (ONDA SIMPLES C - RECICLADO/RECICLADO)' },
        { code: 'ODKK-BC',   desc: 'ODKK-BC (ONDA DUPLA - KRAFT/KRAFT)' },
        { code: 'ODRR-BC',   desc: 'ODRR-BC (ONDA DUPLA - RECICLADO/RECICLADO)' },
        { code: 'ODKR-BC',   desc: 'ODKR-BC (ONDA DUPLA - KRAFT/RECICLADO)' },
        { code: 'ODTT-BC',   desc: 'ODTT-BC (ONDA DUPLA - TESTLINER/TESTLINER)' },
        { code: 'ODBB-BB',   desc: 'ODBB-BB (ONDA DUPLA BB - KRAFT/KRAFT)' },
        { code: 'ODRR-BB',   desc: 'ODRR-BB (ONDA DUPLA BB - RECICLADO/RECICLADO)' },
        { code: 'ODRRes-BC', desc: 'ODRRes-BC (ONDA DUPLA BC - RECICLADO RESINADO)' },
        { code: 'ODBK-BC',   desc: 'ODBK-BC (ONDA DUPLA BC - SEMI-KRAFT/KRAFT)' },
        { code: 'OCKK',      desc: 'OCKK (ONDA SIMPLES C - KRAFT/KRAFT)' }
    ];

    const defaultMaterials = [
        // COCELPA
        { code: 'KCBC80-BC',  name: 'KCBC80-BC',   paperType: 'ODKR-BC',    supplier: 'COCELPA',   grammage: '0,630 kg/m²', pressureRes: '8,00 kg/col', thickness: '', costIpi: 4.47 },
        { code: 'CMB40-B',    name: 'CMB40-B',      paperType: 'OSRR-B',     supplier: 'COCELPA',   grammage: '0,325 kg/m²', pressureRes: '4,00 kg/col', thickness: '', costIpi: 2.36 },
        { code: 'KCB40-B',    name: 'KCB40-B',      paperType: 'OSKR-B',     supplier: 'COCELPA',   grammage: '0,325 kg/m²', pressureRes: '4,00 kg/col', thickness: '', costIpi: 2.51 },
        { code: 'KCB50-B',    name: 'KCB50-B',      paperType: 'OSKR-B',     supplier: 'COCELPA',   grammage: '0,365 kg/m²', pressureRes: '5,00 kg/col', thickness: '', costIpi: 2.74 },
        { code: 'CMBC65-BC',  name: 'CMBC65-BC',    paperType: 'ODRR-BC',    supplier: 'COCELPA',   grammage: '0,555 kg/m²', pressureRes: '6,50 kg/col', thickness: '', costIpi: 3.92 },
        // EMPAR
        { code: 'KB4',        name: 'KB4',           paperType: 'OSKK-B',     supplier: 'EMPAR',     grammage: '0,325 kg/m²', pressureRes: '4,00 kg/col', thickness: '', costIpi: 2.56 },
        { code: 'KB5',        name: 'KB5',           paperType: 'OSKK-B',     supplier: 'EMPAR',     grammage: '0,320 kg/m²', pressureRes: '5,00 kg/col', thickness: '', costIpi: 2.77 },
        { code: 'KB6',        name: 'KB6',           paperType: 'OSKK-B',     supplier: 'EMPAR',     grammage: '0,365 kg/m²', pressureRes: '6,00 kg/col', thickness: '', costIpi: 3.13 },
        // FAPOLPA
        { code: 'FCM07',      name: 'FCM07',         paperType: 'ODTT-BC',    supplier: 'FAPOLPA',   grammage: '0,470 kg/m²', pressureRes: '6,80 kg/col', thickness: '', costIpi: 3.80 },
        { code: 'FCM16',      name: 'FCM16',         paperType: 'OSRR-B',     supplier: 'FAPOLPA',   grammage: '0,320 kg/m²', pressureRes: '3,60 kg/col', thickness: '', costIpi: 2.78 },
        { code: 'FCM05',      name: 'FCM05',         paperType: 'OSRT-T',     supplier: 'FAPOLPA',   grammage: '0,280 kg/m²', pressureRes: '3,80 kg/col', thickness: '', costIpi: 2.32 },
        { code: 'FMM01B-T',   name: 'FMM01B-T',     paperType: 'OSTT-T',     supplier: 'FAPOLPA',   grammage: '0,270 kg/m²', pressureRes: '3,50 kg/col', thickness: '', costIpi: 1.90 },
        // KLABIN
        { code: '34B-KKK60',  name: '34B/KKK60 S/Resina', paperType: 'OSBM-B',  supplier: 'KLABIN',  grammage: '0,412 kg/m²', pressureRes: '6,00 kg/col', thickness: '', costIpi: 3.47 },
        { code: '34B-KKK80',  name: '34B/KKK80 C/Res',    paperType: 'OSBKRES-B', supplier: 'KLABIN', grammage: '0,437 kg/m²', pressureRes: '7,00 kg/col', thickness: '', costIpi: 4.56 },
        { code: '34B-KKK50',  name: '34B/KKK50',          paperType: 'OSKK-B',  supplier: 'KLABIN',  grammage: '0,329 kg/m²', pressureRes: '5,00 kg/col', thickness: '', costIpi: 2.79 },
        { code: '34BC-KKKKK80', name: '34BC/KKKKK80',     paperType: 'ODKK-BC', supplier: 'KLABIN',  grammage: '0,550 kg/m²', pressureRes: '8,00 kg/col', thickness: '', costIpi: 4.60 },
        { code: '34C-KKK60R', name: '34C/KKK60 RESINA',   paperType: 'OCKK-C',  supplier: 'KLABIN',  grammage: '0,500 kg/m²', pressureRes: '6,00 kg/col', thickness: '', costIpi: 3.53 },
        { code: '34BC-KKKKK110', name: '34BC/KKKKK110',   paperType: 'ODKK-BC', supplier: 'KLABIN',  grammage: '0,600 kg/m²', pressureRes: '11,00 kg/col', thickness: '', costIpi: 5.60 },
        // RIO BONITO
        { code: 'CMC315-B',   name: 'CMC315-B',     paperType: 'OSRR-B',     supplier: 'RIO BONITO', grammage: '0,315 kg/m²', pressureRes: '3,50 kg/col', thickness: '', costIpi: 2.43 },
        { code: 'CMC550-BC',  name: 'CMC550-BC',    paperType: 'ODRR-BC',    supplier: 'RIO BONITO', grammage: '0,550 kg/m²', pressureRes: '5,50 kg/col', thickness: '', costIpi: 4.35 },
        { code: 'CMC355-B',   name: 'CMC355-B',     paperType: 'OSRK-B',     supplier: 'RIO BONITO', grammage: '0,355 kg/m²', pressureRes: '4,50 kg/col', thickness: '', costIpi: 3.00 },
        { code: 'CMC435-C',   name: 'CMC435-C',     paperType: 'OCRR-C',     supplier: 'RIO BONITO', grammage: '0,435 kg/m²', pressureRes: '5,50 kg/col', thickness: '', costIpi: 3.69 },
        { code: 'CMC635-BC',  name: 'CMC635-BC',    paperType: 'ODRR-BC',    supplier: 'RIO BONITO', grammage: '0,635 kg/m²', pressureRes: '8,00 kg/col', thickness: '', costIpi: 5.38 },
        { code: 'CMC605-BC',  name: 'CMC605-BC',    paperType: 'ODRR-BC',    supplier: 'RIO BONITO', grammage: '0,605 kg/m²', pressureRes: '6,50 kg/col', thickness: '', costIpi: 5.12 },
        { code: 'CMC705-BC',  name: 'CMC705-BC',    paperType: 'ODRR-BC',    supplier: 'RIO BONITO', grammage: '0,705 kg/m²', pressureRes: '10,00 kg/col', thickness: '', costIpi: 5.97 },
        { code: 'KMC580-BC',  name: 'KMC580-BC',    paperType: 'ODKK-BC',    supplier: 'RIO BONITO', grammage: '0,580 kg/m²', pressureRes: '6,00 kg/col', thickness: '', costIpi: 4.58 },
        // SOPASTA
        { code: 'KE0B-B',    name: 'KE0B-B',        paperType: 'OSRR-B',     supplier: 'SOPASTA',   grammage: '0,344 kg/m²', pressureRes: '4,00 kg/col', thickness: '', costIpi: 2.42 },
        { code: 'K1BB-BB',   name: 'K1BB-BB',        paperType: 'ODBB-BB',    supplier: 'SOPASTA',   grammage: '0,643 kg/m²', pressureRes: '7,50 kg/col', thickness: '', costIpi: 4.51 },
        { code: 'RIKS3C',    name: 'RIKS3C RESINA',  paperType: 'OCRR-C',     supplier: 'SOPASTA',   grammage: '0,514 kg/m²', pressureRes: '6,00 kg/col', thickness: '', costIpi: 3.61 },
        // TROMBINI
        { code: 'PO3060',    name: 'PO3060',          paperType: 'OSRR-B',    supplier: 'TROMBINI',  grammage: '0,358 kg/m²', pressureRes: '4,00 kg/col', thickness: '', costIpi: 2.93 },
        { code: 'PO3200',    name: 'PO3200',          paperType: 'OSKK-B',    supplier: 'TROMBINI',  grammage: '0,388 kg/m²', pressureRes: '4,50 kg/col', thickness: '', costIpi: 3.33 },
        { code: 'PO4050',    name: 'PO4050',          paperType: 'OSBM-B',    supplier: 'TROMBINI',  grammage: '0,403 kg/m²', pressureRes: '5,50 kg/col', thickness: '', costIpi: 4.82 },
        { code: 'PO4190',    name: 'PO4190',          paperType: 'OSBKRES-B', supplier: 'TROMBINI',  grammage: '0,503 kg/m²', pressureRes: '7,00 kg/col', thickness: '', costIpi: 5.67 },
        { code: 'PO5100',    name: 'PO5100',          paperType: 'OSKK-C',    supplier: 'TROMBINI',  grammage: '0,396 kg/m²', pressureRes: '4,50 kg/col', thickness: '', costIpi: 3.76 },
        { code: 'PO5150',    name: 'PO5150',          paperType: 'OCKK',      supplier: 'TROMBINI',  grammage: '0,445 kg/m²', pressureRes: '5,50 kg/col', thickness: '', costIpi: 4.30 },
        { code: 'PO7100',    name: 'PO7100',          paperType: 'ODRR-BC',   supplier: 'TROMBINI',  grammage: '0,619 kg/m²', pressureRes: '6,50 kg/col', thickness: '', costIpi: 4.84 },
        { code: 'PO7150',    name: 'PO7150',          paperType: 'ODKK-BC',   supplier: 'TROMBINI',  grammage: '0,644 kg/m²', pressureRes: '7,00 kg/col', thickness: '', costIpi: 5.16 },
        { code: 'PO7300R',   name: 'PO7300 Res.',     paperType: 'ODRRes-BC', supplier: 'TROMBINI',  grammage: '0,729 kg/m²', pressureRes: '8,50 kg/col', thickness: '', costIpi: 5.90 },
        { code: 'PO7400',    name: 'PO7400',          paperType: 'ODKK-BC',   supplier: 'TROMBINI',  grammage: '0,818 kg/m²', pressureRes: '10,50 kg/col', thickness: '', costIpi: 6.06 },
        { code: 'PO7600',    name: 'PO7600',          paperType: 'ODKK-BC',   supplier: 'TROMBINI',  grammage: '1,053 kg/m²', pressureRes: '13,00 kg/col', thickness: '', costIpi: 8.60 },
        { code: 'POPR8050',  name: 'POPR8050',        paperType: 'ODBK-BC',   supplier: 'TROMBINI',  grammage: '0,690 kg/m²', pressureRes: '-', thickness: '', costIpi: 10.16 },
        { code: 'POPR8150',  name: 'POPR8150',        paperType: 'ODBK-BC',   supplier: 'TROMBINI',  grammage: '0,779 kg/m²', pressureRes: '-', thickness: '', costIpi: 11.53 },
        // WESTROCK
        { code: 'TTBC080',   name: 'TTBC080',         paperType: 'ODKK-BC',   supplier: 'WESTROCK',  grammage: '0,598 kg/m²', pressureRes: '8,00 kg/col', thickness: '', costIpi: 5.41 },
        { code: 'KL0C060',   name: 'KL0C060',         paperType: 'OSKK-C',    supplier: 'WESTROCK',  grammage: '0,422 kg/m²', pressureRes: '6,00 kg/col', thickness: '', costIpi: 3.82 },
        { code: 'KBLC210',   name: 'KBLC210',         paperType: 'ODKK-BC',   supplier: 'WESTROCK',  grammage: '1,400 kg/m²', pressureRes: '21,00 kg/col', thickness: '', costIpi: 13.17 },
        { code: 'KLOC070',   name: 'KLOC070',         paperType: 'OSKK-C',    supplier: 'WESTROCK',  grammage: '0,462 kg/m²', pressureRes: '7,00 kg/col', thickness: '', costIpi: 4.18 },
        { code: 'KLOC085',   name: 'KLOC085',         paperType: 'OSKK-C',    supplier: 'WESTROCK',  grammage: '0,558 kg/m²', pressureRes: '8,50 kg/col', thickness: '', costIpi: 4.95 },
        { code: 'KLBC150F',  name: 'KLBC150F',        paperType: 'ODKK-BC',   supplier: 'WESTROCK',  grammage: '0,925 kg/m²', pressureRes: '15,00 kg/col', thickness: '', costIpi: 8.32 },
        { code: 'KLBC110',   name: 'KLBC110',         paperType: 'ODKK-BC',   supplier: 'WESTROCK',  grammage: '0,712 kg/m²', pressureRes: '11,00 kg/col', thickness: '', costIpi: 6.39 },
        // NOVACKI
        { code: 'NIK60',     name: 'NIK60',           paperType: 'OSRR-B',    supplier: 'NOVACKI',   grammage: '0,325 kg/m²', pressureRes: '3,50 kg/col', thickness: '', costIpi: 2.68 },
        { code: 'NIK61',     name: 'NIK61',           paperType: 'OSRR-B',    supplier: 'NOVACKI',   grammage: '0,390 kg/m²', pressureRes: '5,00 kg/col', thickness: '', costIpi: 3.21 },
        { code: 'NIK62',     name: 'NIK62',           paperType: 'OSRR-B',    supplier: 'NOVACKI',   grammage: '0,450 kg/m²', pressureRes: '5,50 kg/col', thickness: '', costIpi: 3.65 },
        { code: 'NIK70',     name: 'NIK70',           paperType: 'ODRR-BB',   supplier: 'NOVACKI',   grammage: '0,555 kg/m²', pressureRes: '6,20 kg/col', thickness: '', costIpi: 4.53 },
        { code: 'NIK68',     name: 'NIK68',           paperType: 'ODRR-BB',   supplier: 'NOVACKI',   grammage: '0,650 kg/m²', pressureRes: '7,50 kg/col', thickness: '', costIpi: 5.34 },
        { code: 'NIK69',     name: 'NIK69',           paperType: 'ODRR-BB',   supplier: 'NOVACKI',   grammage: '0,785 kg/m²', pressureRes: '10,00 kg/col', thickness: '', costIpi: 6.54 }
    ];

    function ensureUsersIntegrity(userList) {
        if (!Array.isArray(userList)) userList = [];
        defaultUsers.forEach(defU => {
            const idx = userList.findIndex(u => (u.username || '').toLowerCase() === defU.username.toLowerCase());
            if (idx === -1) {
                userList.push(defU);
            } else {
                if (defU.username.toLowerCase() === 'alceu') {
                    userList[idx].password = '@Amj20021979';
                    userList[idx].role = 'admin';
                }
                if (defU.username.toLowerCase() === 'samantha') {
                    userList[idx].password = 'samantha';
                }
            }
        });
        return userList;
    }

    let users = ensureUsersIntegrity(getStoredData('dawos_users', defaultUsers));
    saveStoredData('dawos_users', users);
    let suppliers = getStoredData('dawos_suppliers', defaultSuppliers);
    let paperClasses = getStoredData('dawos_paperclasses', defaultPaperClasses);
    let materials = getStoredData('dawos_materials', defaultMaterials);
    window.dawosMaterials = materials;

    // Auto-repara descrições vazias em paperClasses para eliminar linhas em branco nos dropdowns
    let dirtyPC = false;
    paperClasses.forEach(pc => {
        if (!pc.desc || pc.desc.trim() === '') {
            const match = defaultPaperClasses.find(dp => dp.code === pc.code);
            pc.desc = (match && match.desc && match.desc.trim() !== '') ? match.desc : pc.code;
            dirtyPC = true;
        }
    });
    if (dirtyPC) {
        saveStoredData('dawos_paperclasses', paperClasses);
    }

    if (!Array.isArray(materials)) {
        materials = [...defaultMaterials];
        suppliers = [...defaultSuppliers];
        paperClasses = [...defaultPaperClasses];
        saveStoredData('dawos_materials', defaultMaterials);
        saveStoredData('dawos_suppliers', defaultSuppliers);
        saveStoredData('dawos_paperclasses', defaultPaperClasses);
    }

    window.dawosMaterials = materials;

    const defaultEngineering = [
        {
            style: 'MN-B',
            desc: 'MALETA NORMAL - B',
            category: 'maleta',
            wave: 'B',
            widthFormula: '(L/2)+3 + A+6 + (L/2)+3',
            lengthFormula: 'C+3 + L+3 + C+3 + L+3 + 30'
        },
        {
            style: 'MN-BC',
            desc: 'MALETA NORMAL - BC',
            category: 'maleta',
            wave: 'BC',
            widthFormula: '(L/2)+6 + A+12 + (L/2)+6',
            lengthFormula: 'C+6 + L+6 + C+6 + L+6 + 35'
        },
        {
            style: 'MT-B',
            desc: 'MALETA TRANSPASSE TOTAL - B',
            category: 'maleta',
            subvalue: 'Caixa 4 Abas - Transpasse Total',
            wave: 'B',
            widthFormula: 'L+3 + A+6 + L+3',
            lengthFormula: 'C+3 + L+3 + C+3 + L+3 + 30'
        },
        {
            style: 'MT-BC',
            desc: 'MALETA TRANSPASSE TOTAL - BC',
            category: 'maleta',
            subvalue: 'Caixa 4 Abas - Transpasse Total',
            wave: 'BC',
            widthFormula: 'L+6 + A+12 + L+6',
            lengthFormula: 'C+6 + L+6 + C+6 + L+6 + 35'
        },
        {
            style: 'CV-GERAL',
            desc: 'CORTE E VINCO GERAL',
            category: 'corte-vinco',
            subvalue: 'Corte e Vinco Geral',
            wave: 'B / BC',
            widthFormula: 'L + 30',
            lengthFormula: 'C + 30'
        },
        {
            style: 'SEDEX-B',
            desc: 'CAIXA SEDEX - B',
            category: 'corte-vinco',
            subvalue: 'Caixa Sedex',
            wave: 'B',
            widthFormula: '((((A+1)+8+(A+3))*2)+12)+(C+23)+30',
            lengthFormula: '(A+3)+(L+3)+(A+4)+(L+5)+(A+3)'
        },
        {
            style: 'SEDEX-BC',
            desc: 'CAIXA SEDEX - BC',
            category: 'corte-vinco',
            subvalue: 'Caixa Sedex',
            wave: 'BC',
            widthFormula: '((((A+3)+18+(A+6))*2)+20)+(C+48)',
            lengthFormula: '(A+6)+(L+6)+(A+8)+(L+13)+(A+11)'
        },
        {
            style: 'TAB-B',
            desc: 'TABULEIRO - B',
            category: 'acessorio',
            wave: 'B',
            widthFormula: 'L',
            lengthFormula: 'C'
        },
        {
            style: 'TAB-BC',
            desc: 'TABULEIRO - BC',
            category: 'acessorio',
            wave: 'BC',
            widthFormula: 'L',
            lengthFormula: 'C'
        }
    ];

    let engineering = getStoredData('dawos_engineering', defaultEngineering);
    if (!engineering || engineering.length === 0 || !engineering.some(e => e.style === 'MN-B') || !engineering.some(e => e.style === 'MT-B')) {
        engineering = defaultEngineering;
        saveStoredData('dawos_engineering', defaultEngineering);
    } else {
        // Garante adição de MT-B, MT-BC, CV-GERAL, SEDEX-B e SEDEX-BC em bancos existentes
        if (!engineering.some(e => e.style === 'MT-B')) {
            engineering.push(defaultEngineering[2]);
            engineering.push(defaultEngineering[3]);
        }
        if (!engineering.some(e => e.style === 'CV-GERAL')) {
            engineering.push({
                style: 'CV-GERAL',
                desc: 'CORTE E VINCO GERAL',
                category: 'corte-vinco',
                subvalue: 'Corte e Vinco Geral',
                wave: 'B / BC',
                widthFormula: 'L + 30',
                lengthFormula: 'C + 30'
            });
        }
        if (!engineering.some(e => e.style === 'SEDEX-B')) {
            engineering.push({
                style: 'SEDEX-B',
                desc: 'CAIXA SEDEX - B',
                category: 'corte-vinco',
                subvalue: 'Caixa Sedex',
                wave: 'B',
                widthFormula: '((((A+1)+8+(A+3))*2)+12)+(C+23)+30',
                lengthFormula: '(A+3)+(L+3)+(A+4)+(L+5)+(A+3)'
            });
        }
        if (!engineering.some(e => e.style === 'SEDEX-BC')) {
            engineering.push({
                style: 'SEDEX-BC',
                desc: 'CAIXA SEDEX - BC',
                category: 'corte-vinco',
                subvalue: 'Caixa Sedex',
                wave: 'BC',
                widthFormula: '((((A+3)+18+(A+6))*2)+20)+(C+48)',
                lengthFormula: '(A+6)+(L+6)+(A+8)+(L+13)+(A+11)'
            });
        }
        engineering.forEach(e => {
            if (e.style === 'TAB-B') e.desc = 'TABULEIRO - B';
            if (e.style === 'TAB-BC') e.desc = 'TABULEIRO - BC';
        });
        saveStoredData('dawos_engineering', engineering);
    }

    let currentUser = null;

    // -------------------------------------------------------------
    // 2. MAPEAMENTO DE ELEMENTOS DO DOM
    // -------------------------------------------------------------
    // Telas do App
    const loginScreen = document.getElementById('login-screen');
    const curtainOverlay = document.getElementById('curtain-overlay');
    const adminLandingScreen = document.getElementById('admin-landing-screen');
    const gerenteRestrictedScreen = document.getElementById('gerente-restricted-screen');
    const appContainer = document.getElementById('app-container');
    
    // Login
    const loginForm = document.getElementById('login-form');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const loginError = document.getElementById('login-error');
    const rememberMeCheckbox = document.getElementById('remember-me');
    
    // Header & Logout Geral
    const btnLogout = document.getElementById('btn-logout');
    const btnAdminLogout = document.getElementById('btn-admin-logout');
    const btnGerenteLogout = document.getElementById('btn-gerente-logout');
    const btnBackToLanding = document.getElementById('btn-back-to-landing');
    const headerUserStatus = document.getElementById('header-user-status');
    const welcomeUserName = document.getElementById('welcome-user-name');
    const adminLandingName = document.getElementById('admin-landing-name');

    // Cards da Tela Inicial do Admin
    const cardGotoAdmin = document.getElementById('card-goto-admin');
    const cardGotoPricing = document.getElementById('card-goto-pricing');

    // Abas da Calculadora
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    // Formulário e inputs físicos
    const pricingForm = document.getElementById('pricing-form');
    const boxOptionCards = document.querySelectorAll('.box-option-card:not(.company-option-card)');
    const boxTypeInput = document.getElementById('box-type');
    const boxSubtypeInput = document.getElementById('box-subtype');
    const subOptionCards = document.querySelectorAll('.sub-option-card');
    const subOptionsContainer = document.getElementById('sub-options-container');
    const lengthInput = document.getElementById('dim-length');
    const widthInput = document.getElementById('dim-width');
    const heightInput = document.getElementById('dim-height');

    
    // Material e Acabamento
    const paperClassSelect = document.getElementById('paper-class');
    const materialSupplierSelect = document.getElementById('material-supplier');
    const paperTypeSelect = document.getElementById('paper-type');
    
    // Lote e Logística
    const quantitySlider = document.getElementById('quantity-slider');
    const quantityInput = document.getElementById('quantity');
    
    // Elementos do Resumo do Orçamento
    const summaryBoxText = document.getElementById('summary-box-text');
    const summaryDimText = document.getElementById('summary-dim-text');
    const summaryMaterialText = document.getElementById('summary-material-text');
    const summaryQtyText = document.getElementById('summary-qty-text');
    const summaryUnitPrice = document.getElementById('summary-unit-price');
    const summaryTotalPrice = document.getElementById('summary-total-price');
    
    const companyOptionCards = document.querySelectorAll('.company-option-card');
    const sellingCompanyInput = document.getElementById('selling-company');
    const summaryCompanyText = document.getElementById('summary-company-text');
    
    // Elementos da Área do Administrador
    const adminCredentialsList = document.getElementById('admin-credentials-list');
    const adminMaterialsList = document.getElementById('admin-materials-list');
    const btnInviteLink = document.getElementById('btn-invite-link');
    
    // Botões de ação da calculadora
    const btnSubmitOrder = document.getElementById('btn-submit-order');
    const btnPdfExport = document.getElementById('btn-pdf-export');
    const btnWhatsappShare = document.getElementById('btn-whatsapp-share');

    // Mapeamento dos formulários de cadastro CRUD e abas internas do Admin
    const adminMenuBtns = document.querySelectorAll('.admin-menu-btn');
    const adminSubSections = document.querySelectorAll('.admin-sub-section');

    const adminSuppliersList = document.getElementById('admin-suppliers-list');
    const adminPaperClassesList = document.getElementById('admin-paperclasses-list');

    const btnAddUser = document.getElementById('btn-add-user');
    const btnAddSupplier = document.getElementById('btn-add-supplier');
    const btnAddPaperClass = document.getElementById('btn-add-paperclass');
    const btnAddMaterial = document.getElementById('btn-add-material');

    const formUserContainer = document.getElementById('form-user-container');
    const formSupplierContainer = document.getElementById('form-supplier-container');
    const formPaperClassContainer = document.getElementById('form-paperclass-container');
    const formMaterialContainer = document.getElementById('form-material-container');

    const btnSaveUser = document.getElementById('btn-save-user');
    const btnCancelUser = document.getElementById('btn-cancel-user');
    const btnSaveSupplier = document.getElementById('btn-save-supplier');
    const btnCancelSupplier = document.getElementById('btn-cancel-supplier');
    const btnSavePaperClass = document.getElementById('btn-save-paperclass');
    const btnCancelPaperClass = document.getElementById('btn-cancel-paperclass');
    const btnSaveMaterial = document.getElementById('btn-save-material');
    const btnCancelMaterial = document.getElementById('btn-cancel-material');

    const inputUserIndex = document.getElementById('input-user-index');
    const inputUserName = document.getElementById('input-user-name');
    const inputUserUsername = document.getElementById('input-user-username');
    const inputUserPassword = document.getElementById('input-user-password');
    const inputUserRole = document.getElementById('input-user-role');

    const inputSupplierIndex = document.getElementById('input-supplier-index');
    const inputSupplierName = document.getElementById('input-supplier-name');

    const inputPaperClassIndex = document.getElementById('input-paperclass-index');
    const inputPaperClassCode = document.getElementById('input-paperclass-code');
    const inputPaperClassDesc = document.getElementById('input-paperclass-desc');

    const inputMaterialIndex = document.getElementById('input-material-index');
    const inputMaterialCode = document.getElementById('input-material-code');
    const inputMaterialName = document.getElementById('input-material-name');
    const inputMaterialSupplier = document.getElementById('input-material-supplier');
    const inputMaterialPaperClass = document.getElementById('input-material-paperclass');
    const inputMaterialCost = document.getElementById('input-material-cost');

    // Mapeamento de Engenharia de Caixa
    const adminSectionEngineering = document.getElementById('admin-section-engineering');
    const formEngineeringContainer = document.getElementById('form-engineering-container');
    const formEngineeringTitle = document.getElementById('form-engineering-title');
    const inputEngineeringIndex = document.getElementById('input-engineering-index');
    const inputEngineeringStyle = document.getElementById('input-engineering-style');
    const inputEngineeringDesc = document.getElementById('input-engineering-desc');
    const inputEngineeringCategory = document.getElementById('input-engineering-category');
    const inputEngineeringWave = document.getElementById('input-engineering-wave');
    const inputEngineeringWidth = document.getElementById('input-engineering-width');
    const inputEngineeringLength = document.getElementById('input-engineering-length');
    
    const btnAddEngineering = document.getElementById('btn-add-engineering');
    const btnSaveEngineering = document.getElementById('btn-save-engineering');
    const btnCancelEngineering = document.getElementById('btn-cancel-engineering');
    const adminEngineeringList = document.getElementById('admin-engineering-list');

    // Elementos da Aba Dimensões (Área da chapa)
    const calculatedSheetAreaText = document.getElementById('calculated-sheet-area');
    const calculatedSheetAreaMmText = document.getElementById('calculated-sheet-area-mm');

    // -------------------------------------------------------------
    // 3. AUTENTICAÇÃO E TRANSIÇÃO DA CORTINA DE SUBIDA
    // -------------------------------------------------------------
    
    // Toggle de visibilidade da senha (Olhinho 👁️)
    const btnTogglePassword = document.getElementById('btn-toggle-password');
    if (btnTogglePassword && passwordInput) {
        btnTogglePassword.addEventListener('click', (e) => {
            e.preventDefault();
            if (passwordInput.type === 'password') {
                passwordInput.type = 'text';
                btnTogglePassword.textContent = '🙈';
            } else {
                passwordInput.type = 'password';
                btnTogglePassword.textContent = '👁️';
            }
        });
    }

    // Atalho da Tecla ENTER nos inputs de Usuário e Senha
    [usernameInput, passwordInput].forEach(inputEl => {
        if (inputEl) {
            inputEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (typeof loginForm.requestSubmit === 'function') {
                        loginForm.requestSubmit();
                    } else {
                        const submitBtn = document.getElementById('btn-login-submit');
                        if (submitBtn) submitBtn.click();
                    }
                }
            });
        }
    });

    // Login Form Submit (com Busca em Tempo Real na Nuvem Supabase e Tolerância Inteligente de Senha)
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        users = ensureUsersIntegrity(users);
        const username = usernameInput.value.trim().toLowerCase();
        const password = passwordInput.value.trim();
        
        // Helper para comparação de senha com tolerância a maiúsculas/minúsculas e símbolo @
        const matchesPass = (storedPass, typedPass) => {
            if (!storedPass || !typedPass) return false;
            const s = storedPass.trim();
            const t = typedPass.trim();
            if (s === t) return true;
            if (s.toLowerCase() === t.toLowerCase()) return true;
            if (s.replace(/@/g, '').toLowerCase() === t.replace(/@/g, '').toLowerCase()) return true;
            return false;
        };

        // 1. Tenta verificar no cache local
        let user = users.find(u => (u.username || '').toLowerCase() === username && matchesPass(u.password, password));
        
        // Regra especial direta para o Alceu Administrador
        if (!user && username === 'alceu' && matchesPass('@Amj20021979', password)) {
            user = { name: 'Alceu', username: 'alceu', password: '@Amj20021979', role: 'admin' };
        }

        // 2. Se não encontrou no cache local, realiza busca em TEMPO REAL na NUVEM SUPABASE!
        if (!user && window.supabaseClient) {
            try {
                const { data: cloudMatch } = await window.supabaseClient.from('xpace_users').select('*').eq('username', username).single();
                if (cloudMatch && matchesPass(cloudMatch.password, password)) {
                    user = {
                        name: cloudMatch.name,
                        username: (cloudMatch.username || '').toLowerCase(),
                        password: cloudMatch.password,
                        role: cloudMatch.role || 'cliente'
                    };
                    const existingIdx = users.findIndex(u => (u.username || '').toLowerCase() === user.username);
                    if (existingIdx >= 0) {
                        users[existingIdx] = user;
                    } else {
                        users.push(user);
                    }
                    saveStoredData('dawos_users', users);
                }
            } catch (errCloud) {
                console.warn("Consulta direta Nuvem no login (tabela):", errCloud);
            }

            // Se ainda não encontrou, busca no backup de contingência DAWOS_USER_LIST
            if (!user) {
                try {
                    const { data: backupData } = await window.supabaseClient.from('xpace_pricing_params').select('*').eq('company_id', 'DAWOS_USER_LIST');
                    if (backupData && backupData.length > 0 && backupData[0].user_json) {
                        const parsed = JSON.parse(backupData[0].user_json);
                        if (Array.isArray(parsed)) {
                            const found = parsed.find(b => (b.username || '').toLowerCase() === username && matchesPass(b.password, password));
                            if (found) {
                                user = found;
                                const existingIdx = users.findIndex(u => (u.username || '').toLowerCase() === user.username);
                                if (existingIdx >= 0) {
                                    users[existingIdx] = user;
                                } else {
                                    users.push(user);
                                }
                                saveStoredData('dawos_users', users);
                            }
                        }
                    }
                } catch(eBackup){}
            }
        }

        // 3. Fallback Infalível contra defaultUsers
        if (!user) {
            const defMatch = defaultUsers.find(d => d.username.toLowerCase() === username && matchesPass(d.password, password));
            if (defMatch) {
                user = defMatch;
                if (!users.some(u => (u.username || '').toLowerCase() === user.username)) {
                    users.push(user);
                    saveStoredData('dawos_users', users);
                }
            }
        }
        
        if (user) {
            loginError.textContent = '';
            currentUser = user;
            
            // Lógica de "Lembrar de mim": SALVA APENAS SE MARCAR EXPLICITAMENTE O CHECKBOX NESTE DISPOSITIVO
            if (rememberMeCheckbox && rememberMeCheckbox.checked) {
                localStorage.setItem('dawos_remembered_user', username);
                localStorage.setItem('dawos_remembered_pass', password);
            } else {
                localStorage.removeItem('dawos_remembered_user');
                localStorage.removeItem('dawos_remembered_pass');
            }
            
            // Disparar animação da cortina de subida
            triggerCurtainWelcome(user);
        } else {
            loginError.textContent = '❌ USUÁRIO OU SENHA INCORRETOS.';
        }
    });

    // Animação da Cortina
    function triggerCurtainWelcome(user) {
        welcomeUserName.textContent = user.name;
        
        // Exibir cortina fechada
        curtainOverlay.classList.remove('hidden');
        curtainOverlay.classList.remove('open');
        
        // Ocultar login
        loginScreen.classList.add('hidden');
        
        // Configurar dados nas respectivas telas
        headerUserStatus.textContent = `LOGADO: ${user.name}`;
        adminLandingName.textContent = user.name;
        
        // Gerenciamento de abas exclusivas de administrador na calculadora
        const adminElements = document.querySelectorAll('.admin-only');
        
        if (user.role === 'admin') {
            adminElements.forEach(el => el.style.display = 'block');
            renderAdminCredentials();
            renderAdminSuppliers();
            renderAdminPaperClasses();
            renderAdminMaterials();
        } else {
            adminElements.forEach(el => el.style.display = 'none');
        }

        // Executar transição da cortina lateral (exibe a tela por 4 segundos completos)
        setTimeout(() => {
            curtainOverlay.classList.add('open'); // Painéis abrem lateralmente para esquerda e direita
            
            setTimeout(() => {
                if (user.role === 'admin') {
                    // Direciona Administrador para tela de escolha
                    adminLandingScreen.classList.remove('hidden');
                } else if (user.role === 'gerente') {
                    // Direciona Gerente para tela de aviso de permissões pendentes
                    if (gerenteRestrictedScreen) {
                        const gName = document.getElementById('gerente-user-name');
                        if (gName) gName.textContent = user.name;
                        gerenteRestrictedScreen.classList.remove('hidden');
                    }
                } else {
                    // Direciona Representante ou Cliente direto para a calculadora de formação de preço
                    appContainer.className = 'app-container mode-pricing';
                    appContainer.classList.remove('hidden');
                    // Ativa a primeira aba
                    const firstTab = tabBtns[0];
                    if (firstTab) firstTab.click();
                    
                    populateCalculatorDropdowns();
                    updateSummaryData();
                }
            }, 600);
            
            setTimeout(() => {
                curtainOverlay.classList.add('hidden');
            }, 1200);
            
        }, 4000);
    }

    // Função auxiliar para preencher credenciais lembradas (Apenas se salvas LOCALMENTE neste PC)
    function fillRememberedCredentials() {
        if (!usernameInput || !passwordInput) return;
        const savedUser = localStorage.getItem('dawos_remembered_user');
        const savedPass = localStorage.getItem('dawos_remembered_pass');
        if (savedUser && savedPass) {
            usernameInput.value = savedUser;
            passwordInput.value = savedPass;
            if (rememberMeCheckbox) rememberMeCheckbox.checked = true;
        } else {
            usernameInput.value = "";
            passwordInput.value = "";
            if (rememberMeCheckbox) rememberMeCheckbox.checked = false;
        }
    }

    // Logout Geral (Admin, Gerente, Representante, Cliente)
    function executeLogout() {
        currentUser = null;
        loginError.textContent = '';
        
        // Restaura credenciais lembradas no dispositivo (se salvas pelo usuário neste PC)
        fillRememberedCredentials();
        
        // Voltar abas para primeira
        const firstTab = tabBtns[0];
        if (firstTab) firstTab.click();
        
        // Esconder absolutamente todos os containers do painel e mostrar login fixo sem rolagem
        appContainer.classList.add('hidden');
        adminLandingScreen.classList.add('hidden');
        if (gerenteRestrictedScreen) gerenteRestrictedScreen.classList.add('hidden');
        loginScreen.classList.remove('hidden');

        // Reset classes de modo e scroll
        appContainer.className = 'app-container hidden';
        window.scrollTo(0, 0);
    }

    if (btnLogout) btnLogout.addEventListener('click', executeLogout);
    if (btnAdminLogout) btnAdminLogout.addEventListener('click', executeLogout);
    if (btnGerenteLogout) btnGerenteLogout.addEventListener('click', executeLogout);

    // Voltar do Painel para a Tela de Escolha do Admin
    btnBackToLanding.addEventListener('click', () => {
        appContainer.classList.add('hidden');
        adminLandingScreen.classList.remove('hidden');
    });

    // -------------------------------------------------------------
    // 4. DIRECIONAMENTO DE PAINÉIS DO ADMIN (TELA DE SELEÇÃO)
    // -------------------------------------------------------------
    
    // Ir para Painel de Gerenciamento Geral
    cardGotoAdmin.addEventListener('click', () => {
        adminLandingScreen.classList.add('hidden');
        appContainer.className = 'app-container mode-admin';
        appContainer.classList.remove('hidden');
        
        // Ativa a aba do admin
        const adminTabBtn = document.querySelector('.tab-btn.admin-only');
        if (adminTabBtn) {
            adminTabBtn.click();
        }

        // Esconder todos os formulários CRUD
        formUserContainer.classList.add('hidden');
        formSupplierContainer.classList.add('hidden');
        formPaperClassContainer.classList.add('hidden');
        formMaterialContainer.classList.add('hidden');
        if (formEngineeringContainer) formEngineeringContainer.classList.add('hidden');

        // Renderizar listas
        renderAdminCredentials();
        renderAdminSuppliers();
        renderAdminPaperClasses();
        renderAdminMaterials();
        renderAdminEngineering();
        renderPaperCostTable();

        // Ativa a primeira aba interna (Usuários)
        const firstSubBtn = document.querySelector('.admin-menu-btn');
        if (firstSubBtn) {
            firstSubBtn.click();
        }
        
        updateSummaryData();
    });

    // Ir para Painel de Formação de Preço (Calculadora)
    cardGotoPricing.addEventListener('click', () => {
        adminLandingScreen.classList.add('hidden');
        appContainer.className = 'app-container mode-pricing';
        appContainer.classList.remove('hidden');
        
        // Recarregar os dropdowns caso tenham sido alterados no admin
        populateCalculatorDropdowns();

        // Ativa a primeira aba (Estrutura)
        const firstTab = tabBtns[0];
        if (firstTab) {
            firstTab.click();
        }
        
        // Inicializar com TROMBINI selecionado por padrão se existir
        if (materialSupplierSelect && suppliers.includes('TROMBINI')) {
            materialSupplierSelect.value = 'TROMBINI';
            materialSupplierSelect.dispatchEvent(new Event('change'));
            if (paperClassSelect && paperClassSelect.options.length > 1) {
                paperClassSelect.selectedIndex = 1;
                paperClassSelect.dispatchEvent(new Event('change'));
            }
        }

        updateSummaryData();
    });

    // -------------------------------------------------------------
    // 5. GERENCIADOR DE CADASTROS (CRUD ADMINISTRATIVO)
    // -------------------------------------------------------------
    
    // Alternar abas do submenu administrativo
    adminMenuBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            adminMenuBtns.forEach(b => b.classList.remove('active'));
            adminSubSections.forEach(sec => sec.classList.add('hidden'));
            
            btn.classList.add('active');
            const targetId = btn.getAttribute('data-admin-target');
            const targetEl = document.getElementById(targetId);
            if (targetEl) targetEl.classList.remove('hidden');

            if (targetId === 'admin-section-papercost' && typeof renderPaperCostTable === 'function') {
                renderPaperCostTable();
            } else if (targetId === 'admin-section-params' && typeof loadParamsIntoForm === 'function') {
                loadParamsIntoForm();
            } else if (targetId === 'admin-section-tempos' && typeof dawosRenderTemposAdmin === 'function') {
                dawosRenderTemposAdmin();
            }
        });
    });

    // Helpers para formulários
    function showForm(formEl, titleEl, titleText) {
        formEl.classList.remove('hidden');
        if (titleEl) titleEl.textContent = titleText;
    }

    function hideForm(formEl) {
        formEl.classList.add('hidden');
    }

    // 1. CRUD USUÁRIOS
    function renderAdminCredentials() {
        adminCredentialsList.innerHTML = '';
        const roleLabels = {
            admin: 'ADMINISTRADOR',
            rep_junior: 'REP. JÚNIOR',
            rep_senior: 'REP. SÊNIOR',
            rep_master: 'REP. MASTER',
            representante: 'REPRESENTANTE',
            gerente: 'GERENTE',
            cliente: 'CLIENTE'
        };

        const roleBadgeStyles = {
            admin: 'background: rgba(227, 0, 126, 0.15); color: #e3007e; border: 1px solid rgba(227, 0, 126, 0.3); font-weight: 700;',
            rep_junior: 'background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); font-weight: 700;',
            rep_senior: 'background: rgba(14, 165, 233, 0.15); color: #0284c7; border: 1px solid rgba(14, 165, 233, 0.3); font-weight: 700;',
            rep_master: 'background: rgba(2, 132, 199, 0.15); color: #0369a1; border: 1px solid rgba(2, 132, 199, 0.3); font-weight: 700;',
            representante: 'background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); font-weight: 700;',
            gerente: 'background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); font-weight: 700;',
            cliente: 'background: rgba(167, 139, 250, 0.15); color: #a78bfa; border: 1px solid rgba(167, 139, 250, 0.3); font-weight: 700;'
        };

        users.forEach((user, index) => {
            const tr = document.createElement('tr');
            const rKey = (user.role || '').toLowerCase();
            const styleStr = roleBadgeStyles[rKey] || 'background: rgba(255,255,255,0.05); color: var(--color-text-secondary);';
            const labelStr = roleLabels[rKey] || (user.role || '').toUpperCase();
            tr.innerHTML = `
                <td><strong>${user.name}</strong></td>
                <td style="font-family: var(--font-mono);">${user.username}</td>
                <td><span class="badge" style="padding: 4px 10px; border-radius: 6px; font-size: 0.75rem; ${styleStr}">${labelStr}</span></td>
                <td style="font-family: var(--font-mono);">${user.password}</td>
                <td style="text-align: right;">
                    <button type="button" class="btn-admin-action btn-edit-user" data-index="${index}">EDITAR</button>
                    <button type="button" class="btn-admin-action btn-delete-user" data-index="${index}" style="background: #ff5252; margin-left: 6px;">EXCLUIR</button>
                </td>
            `;
            adminCredentialsList.appendChild(tr);
        });
    }

    btnAddUser.addEventListener('click', () => {
        showForm(formUserContainer, document.getElementById('form-user-title'), 'CADASTRAR NOVO USUÁRIO');
        inputUserIndex.value = '';
        inputUserName.value = '';
        inputUserUsername.value = '';
        inputUserPassword.value = '';
        inputUserRole.value = 'cliente';
    });

    btnCancelUser.addEventListener('click', () => hideForm(formUserContainer));

    btnSaveUser.addEventListener('click', async () => {
        const index = inputUserIndex.value;
        const name = inputUserName.value.trim();
        const username = inputUserUsername.value.trim().toLowerCase();
        const password = inputUserPassword.value.trim();
        const role = inputUserRole.value;

        if (!name || !username || !password) {
            alert('POR FAVOR, PREENCHA TODOS OS CAMPOS.');
            return;
        }

        const newUser = { name, username, password, role };

        if (index === '') {
            // Incluir
            if (users.some(u => u.username === username)) {
                alert('ESTE NOME DE USUÁRIO JÁ EXISTE.');
                return;
            }
            users.push(newUser);
        } else {
            // Editar
            const originalUser = users[index];
            if (originalUser.username !== username && users.some(u => u.username === username)) {
                alert('ESTE NOME DE USUÁRIO JÁ EXISTE.');
                return;
            }
            users[index] = newUser;
        }

        saveStoredData('dawos_users', users);
        renderAdminCredentials();
        hideForm(formUserContainer);

        // Sincroniza criação/edição em Dual Cloud para liberação imediata em qualquer PC
        await saveUsersToCloud(users);
        alert(`✅ USUÁRIO "${newUser.name}" (${newUser.username}) SALVO E ATIVADO EM TODOS OS DISPOSITIVOS COM SUCESSO!`);
    });

    adminCredentialsList.addEventListener('click', async (e) => {
        const index = e.target.getAttribute('data-index');
        if (e.target.classList.contains('btn-edit-user')) {
            const user = users[index];
            showForm(formUserContainer, document.getElementById('form-user-title'), 'EDITAR USUÁRIO');
            inputUserIndex.value = index;
            inputUserName.value = user.name;
            inputUserUsername.value = user.username;
            inputUserPassword.value = user.password;
            inputUserRole.value = user.role;
        } else if (e.target.classList.contains('btn-delete-user')) {
            const targetUser = users[index];
            if (targetUser.username === 'alceu') {
                alert('NÃO É POSSÍVEL EXCLUIR O ADMINISTRADOR PADRÃO DO SISTEMA.');
                return;
            }
            if (confirm(`DESEJA REALMENTE EXCLUIR O USUÁRIO "${targetUser.name}"?`)) {
                users.splice(index, 1);
                saveStoredData('dawos_users', users);
                renderAdminCredentials();
                await saveUsersToCloud(users);
                if (window.supabaseClient) {
                    try {
                        await window.supabaseClient.from('xpace_users').delete().eq('username', targetUser.username);
                    } catch(e) {}
                }
            }
        }
    });

    // Funcionalidade de copiar o link de cadastro do convite
    btnInviteLink.addEventListener('click', () => {
        const inviteUrl = 'https://dawosembalagens.com.br/cadastro';
        navigator.clipboard.writeText(inviteUrl)
            .then(() => {
                const originalText = btnInviteLink.innerHTML;
                btnInviteLink.innerHTML = '✔ COPIADO!';
                btnInviteLink.style.borderColor = 'var(--color-success)';
                btnInviteLink.style.color = 'var(--color-success)';
                setTimeout(() => {
                    btnInviteLink.innerHTML = originalText;
                    btnInviteLink.style.borderColor = 'rgba(217, 119, 36, 0.4)';
                    btnInviteLink.style.color = 'var(--color-laranja-bright)';
                }, 2000);
            })
            .catch(err => {
                alert(`LINK: ${inviteUrl}`);
            });
    });

    // 2. CRUD FORNECEDORES
    function renderAdminSuppliers() {
        adminSuppliersList.innerHTML = '';
        suppliers.forEach((sup, index) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${sup}</strong></td>
                <td style="text-align: right;">
                    <button type="button" class="btn-admin-action btn-edit-supplier" data-index="${index}">EDITAR</button>
                    <button type="button" class="btn-admin-action btn-delete-supplier" data-index="${index}" style="background: #ff5252; margin-left: 6px;">EXCLUIR</button>
                </td>
            `;
            adminSuppliersList.appendChild(tr);
        });
    }

    btnAddSupplier.addEventListener('click', () => {
        showForm(formSupplierContainer, document.getElementById('form-supplier-title'), 'CADASTRAR NOVO FORNECEDOR');
        inputSupplierIndex.value = '';
        inputSupplierName.value = '';
    });

    btnCancelSupplier.addEventListener('click', () => hideForm(formSupplierContainer));

    btnSaveSupplier.addEventListener('click', () => {
        const index = inputSupplierIndex.value;
        const name = inputSupplierName.value.trim().toUpperCase();

        if (!name) {
            alert('DIGITE O NOME DO FORNECEDOR.');
            return;
        }

        if (index === '') {
            if (suppliers.includes(name)) {
                alert('ESTE FORNECEDOR JÁ ESTÁ CADASTRADO.');
                return;
            }
            suppliers.push(name);
        } else {
            const oldName = suppliers[index];
            if (oldName !== name && suppliers.includes(name)) {
                alert('ESTE FORNECEDOR JÁ ESTÁ CADASTRADO.');
                return;
            }
            suppliers[index] = name;
            // Atualizar o nome do fornecedor nos materiais cadastrados
            materials.forEach((m, idx) => {
                if (m.supplier === oldName) materials[idx].supplier = name;
            });
            saveStoredData('dawos_materials', materials);
        }

        saveStoredData('dawos_suppliers', suppliers);
        renderAdminSuppliers();
        populateCalculatorDropdowns();
        hideForm(formSupplierContainer);
    });

    adminSuppliersList.addEventListener('click', (e) => {
        const index = e.target.getAttribute('data-index');
        if (e.target.classList.contains('btn-edit-supplier')) {
            showForm(formSupplierContainer, document.getElementById('form-supplier-title'), 'EDITAR FORNECEDOR');
            inputSupplierIndex.value = index;
            inputSupplierName.value = suppliers[index];
        } else if (e.target.classList.contains('btn-delete-supplier')) {
            const name = suppliers[index];
            if (confirm(`DESEJA EXCLUIR O FORNECEDOR "${name}"? ISSO AFETARÁ TODOS OS MATERIAIS DELE.`)) {
                suppliers.splice(index, 1);
                // Remove materiais desse fornecedor
                materials = materials.filter(m => m.supplier !== name);
                saveStoredData('dawos_materials', materials);
                saveStoredData('dawos_suppliers', suppliers);
                
                renderAdminSuppliers();
                renderAdminMaterials();
                populateCalculatorDropdowns();
            }
        }
    });

    // 3. CRUD TIPOS DE PAPELÃO
    function renderAdminPaperClasses() {
        adminPaperClassesList.innerHTML = '';
        paperClasses.forEach((pc, index) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-family: var(--font-mono);"><strong>${pc.code}</strong></td>
                <td>${pc.desc}</td>
                <td style="text-align: right;">
                    <button type="button" class="btn-admin-action btn-edit-paperclass" data-index="${index}">EDITAR</button>
                    <button type="button" class="btn-admin-action btn-delete-paperclass" data-index="${index}" style="background: #ff5252; margin-left: 6px;">EXCLUIR</button>
                </td>
            `;
            adminPaperClassesList.appendChild(tr);
        });
    }

    btnAddPaperClass.addEventListener('click', () => {
        showForm(formPaperClassContainer, document.getElementById('form-paperclass-title'), 'CADASTRAR NOVO TIPO DE PAPELÃO');
        inputPaperClassIndex.value = '';
        inputPaperClassCode.value = '';
        inputPaperClassDesc.value = '';
    });

    btnCancelPaperClass.addEventListener('click', () => hideForm(formPaperClassContainer));

    btnSavePaperClass.addEventListener('click', () => {
        const index = inputPaperClassIndex.value;
        const code = inputPaperClassCode.value.trim().toUpperCase();
        const desc = inputPaperClassDesc.value.trim().toUpperCase();

        if (!code || !desc) {
            alert('PREENCHA O CÓDIGO E A DESCRIÇÃO DO TIPO DE PAPELÃO.');
            return;
        }

        const newPC = { code, desc };

        if (index === '') {
            if (paperClasses.some(p => p.code === code)) {
                alert('ESTE TIPO DE PAPELÃO JÁ EXISTE.');
                return;
            }
            paperClasses.push(newPC);
        } else {
            const oldCode = paperClasses[index].code;
            if (oldCode !== code && paperClasses.some(p => p.code === code)) {
                alert('ESTE TIPO DE PAPELÃO JÁ EXISTE.');
                return;
            }
            paperClasses[index] = newPC;
            // Atualizar nos materiais cadastrados
            materials.forEach((m, idx) => {
                if (m.paperType === oldCode) materials[idx].paperType = code;
            });
            saveStoredData('dawos_materials', materials);
        }

        saveStoredData('dawos_paperclasses', paperClasses);
        renderAdminPaperClasses();
        populateCalculatorDropdowns();
        hideForm(formPaperClassContainer);
    });

    adminPaperClassesList.addEventListener('click', (e) => {
        const index = e.target.getAttribute('data-index');
        if (e.target.classList.contains('btn-edit-paperclass')) {
            const pc = paperClasses[index];
            showForm(formPaperClassContainer, document.getElementById('form-paperclass-title'), 'EDITAR TIPO DE PAPELÃO');
            inputPaperClassIndex.value = index;
            inputPaperClassCode.value = pc.code;
            inputPaperClassDesc.value = pc.desc;
        } else if (e.target.classList.contains('btn-delete-paperclass')) {
            const code = paperClasses[index].code;
            if (confirm(`DESEJA EXCLUIR O TIPO DE PAPELÃO "${code}"? ISSO REMOVERÁ TODOS OS MATERIAIS ESPECÍFICOS DELE.`)) {
                paperClasses.splice(index, 1);
                materials = materials.filter(m => m.paperType !== code);
                saveStoredData('dawos_materials', materials);
                saveStoredData('dawos_paperclasses', paperClasses);
                
                renderAdminPaperClasses();
                renderAdminMaterials();
                populateCalculatorDropdowns();
            }
        }
    });

    // 4. CRUD MATERIAIS ESPECÍFICOS
    function populateAdminMaterialFormDropdowns() {
        inputMaterialSupplier.innerHTML = '<option value="" disabled selected>SELECIONE O FORNECEDOR</option>';
        suppliers.forEach(sup => {
            const opt = document.createElement('option');
            opt.value = sup;
            opt.textContent = sup;
            inputMaterialSupplier.appendChild(opt);
        });

        inputMaterialPaperClass.innerHTML = '<option value="" disabled selected>SELECIONE O TIPO DE PAPELÃO</option>';
        paperClasses.forEach(pc => {
            const opt = document.createElement('option');
            opt.value = pc.code;
            opt.textContent = `${pc.code} - ${pc.desc}`;
            inputMaterialPaperClass.appendChild(opt);
        });
    }

    btnAddMaterial.addEventListener('click', () => {
        populateAdminMaterialFormDropdowns();
        showForm(formMaterialContainer, document.getElementById('form-material-title'), 'CADASTRAR NOVO MATERIAL ESPECÍFICO');
        inputMaterialIndex.value = '';
        inputMaterialCode.value = '';
        inputMaterialName.value = '';
        inputMaterialCost.value = '';
    });

    btnCancelMaterial.addEventListener('click', () => hideForm(formMaterialContainer));

    btnSaveMaterial.addEventListener('click', () => {
        const index = inputMaterialIndex.value;
        const code = inputMaterialCode.value.trim().toUpperCase();
        const name = inputMaterialName.value.trim().toUpperCase();
        const supplier = inputMaterialSupplier.value;
        const paperType = inputMaterialPaperClass.value;
        const cost = parseFloat(inputMaterialCost.value) || 0;

        if (!code || !name || !supplier || !paperType || cost <= 0) {
            alert('PREENCHA TODOS OS CAMPOS CORRETAMENTE E COM CUSTO MAIOR QUE ZERO.');
            return;
        }

        const newMat = { code, name, supplier, paperType, cost };

        if (index === '') {
            if (materials.some(m => m.code === code)) {
                alert('ESTE CÓDIGO DE MATERIAL JÁ EXISTE.');
                return;
            }
            materials.push(newMat);
        } else {
            const oldCode = materials[index].code;
            if (oldCode !== code && materials.some(m => m.code === code)) {
                alert('ESTE CÓDIGO DE MATERIAL JÁ EXISTE.');
                return;
            }
            materials[index] = newMat;
        }

        saveStoredData('dawos_materials', materials);
        renderAdminMaterials();
        populateCalculatorDropdowns();
        hideForm(formMaterialContainer);
    });

    adminMaterialsList.addEventListener('click', (e) => {
        const index = e.target.getAttribute('data-index');
        if (e.target.classList.contains('btn-edit-material')) {
            populateAdminMaterialFormDropdowns();
            const mat = materials[index];
            showForm(formMaterialContainer, document.getElementById('form-material-title'), 'EDITAR MATERIAL ESPECÍFICO');
            inputMaterialIndex.value = index;
            inputMaterialCode.value = mat.code;
            inputMaterialName.value = mat.name;
            inputMaterialSupplier.value = mat.supplier;
            inputMaterialPaperClass.value = mat.paperType;
            inputMaterialCost.value = mat.cost;
        } else if (e.target.classList.contains('btn-delete-material')) {
            if (confirm(`DESEJA EXCLUIR O MATERIAL "${materials[index].name}"?`)) {
                materials.splice(index, 1);
                saveStoredData('dawos_materials', materials);
                renderAdminMaterials();
                populateCalculatorDropdowns();
            }
        }
    });

    function renderAdminMaterials() {
        if (!adminMaterialsList) return;
        adminMaterialsList.innerHTML = '';
        materials.forEach((mat, index) => {
            const tr = document.createElement('tr');
            const costIpi = mat.costIpi !== undefined ? mat.costIpi : (mat.cost || 0);
            tr.innerHTML = `
                <td style="font-family: var(--font-mono); font-size: 0.75rem;">${mat.code}</td>
                <td><strong>${mat.name}</strong></td>
                <td><span class="badge" style="background: rgba(217, 119, 36, 0.1); color: var(--color-laranja-bright); border: 1px solid rgba(217, 119, 36, 0.2);">${mat.paperType}</span></td>
                <td>${mat.supplier}</td>
                <td style="font-size: 0.78rem; color: var(--color-text-secondary);">${mat.grammage || '-'}</td>
                <td style="font-size: 0.78rem; color: var(--color-text-secondary);">${mat.pressureRes || '-'}</td>
                <td><strong style="color: #4ade80;">R$ ${costIpi.toFixed(2)}</strong><br><span style="font-size:0.68rem; color:var(--color-text-muted);">PREÇO C/ IPI</span></td>
                <td style="text-align: right; white-space: nowrap;">
                    <button type="button" class="btn-admin-action btn-delete-material" data-index="${index}" style="background: #ff5252;">EXCLUIR</button>
                </td>
            `;
            adminMaterialsList.appendChild(tr);
        });
        if (typeof renderPaperCostTable === 'function') renderPaperCostTable();
    }

    // 5. CRUD ENGENHARIA DE CAIXA
    function renderAdminEngineering() {
        if (!adminEngineeringList) return;
        adminEngineeringList.innerHTML = '';
        engineering.forEach((eng, index) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-family: var(--font-mono); font-size: 0.75rem; white-space: nowrap;">${eng.style}</td>
                <td style="white-space: nowrap; font-size: 0.78rem;"><strong>${eng.desc}</strong></td>
                <td style="white-space: nowrap;"><span class="badge" style="background: rgba(255,255,255,0.05); color: var(--color-text-secondary);">${eng.category.toUpperCase()}</span></td>
                <td style="white-space: nowrap;"><span class="badge" style="background: rgba(217, 119, 36, 0.1); color: var(--color-laranja-bright);">${eng.wave}</span></td>
                <td style="font-family: var(--font-mono); font-size: 0.72rem; white-space: nowrap;">${eng.widthFormula}</td>
                <td style="font-family: var(--font-mono); font-size: 0.72rem; white-space: nowrap;">${eng.lengthFormula}</td>
                <td style="text-align: right; white-space: nowrap;">
                    <button type="button" class="btn-admin-action btn-edit-engineering" data-index="${index}">EDITAR</button>
                    <button type="button" class="btn-admin-action btn-delete-engineering" data-index="${index}" style="background: #ff5252; margin-left: 6px;">EXCLUIR</button>
                </td>
            `;
            adminEngineeringList.appendChild(tr);
        });
    }

    if (btnAddEngineering) {
        btnAddEngineering.addEventListener('click', () => {
            showForm(formEngineeringContainer, formEngineeringTitle, 'CADASTRAR NOVA FÓRMULA DE ENGENHARIA');
            inputEngineeringIndex.value = '';
            inputEngineeringStyle.value = '';
            inputEngineeringDesc.value = '';
            inputEngineeringCategory.value = 'maleta';
            inputEngineeringWave.value = 'B';
            inputEngineeringWidth.value = '';
            inputEngineeringLength.value = '';
        });
    }

    if (btnCancelEngineering) {
        btnCancelEngineering.addEventListener('click', () => hideForm(formEngineeringContainer));
    }

    if (btnSaveEngineering) {
        btnSaveEngineering.addEventListener('click', () => {
            const index = inputEngineeringIndex.value;
            const style = inputEngineeringStyle.value.trim().toUpperCase();
            const desc = inputEngineeringDesc.value.trim().toUpperCase();
            const category = inputEngineeringCategory.value;
            const wave = inputEngineeringWave.value;
            const widthFormula = inputEngineeringWidth.value.trim();
            const lengthFormula = inputEngineeringLength.value.trim();

            if (!style || !desc || !widthFormula || !lengthFormula) {
                alert('POR FAVOR, PREENCHA TODOS OS CAMPOS DAS FÓRMULAS.');
                return;
            }

            const newEng = { style, desc, category, wave, widthFormula, lengthFormula };

            if (index === '') {
                if (engineering.some(e => e.style === style)) {
                    alert('ESTE ESTILO DE ENGENHARIA JÁ ESTÁ CADASTRADO.');
                    return;
                }
                engineering.push(newEng);
            } else {
                const oldStyle = engineering[index].style;
                if (oldStyle !== style && engineering.some(e => e.style === style)) {
                    alert('ESTE ESTILO DE ENGENHARIA JÁ ESTÁ CADASTRADO.');
                    return;
                }
                engineering[index] = newEng;
            }

            saveStoredData('dawos_engineering', engineering);
            renderAdminEngineering();
            hideForm(formEngineeringContainer);
            updateSummaryData(); // Recalcula a área se estiver mudando fórmulas
        });
    }

    if (adminEngineeringList) {
        adminEngineeringList.addEventListener('click', (e) => {
            const index = e.target.getAttribute('data-index');
            if (e.target.classList.contains('btn-edit-engineering')) {
                const eng = engineering[index];
                showForm(formEngineeringContainer, formEngineeringTitle, 'EDITAR FÓRMULA DE ENGENHARIA');
                inputEngineeringIndex.value = index;
                inputEngineeringStyle.value = eng.style;
                inputEngineeringDesc.value = eng.desc;
                inputEngineeringCategory.value = eng.category;
                inputEngineeringWave.value = eng.wave;
                inputEngineeringWidth.value = eng.widthFormula;
                inputEngineeringLength.value = eng.lengthFormula;
            } else if (e.target.classList.contains('btn-delete-engineering')) {
                if (confirm(`DESEJA REALMENTE EXCLUIR O ESTILO "${engineering[index].style}"?`)) {
                    engineering.splice(index, 1);
                    saveStoredData('dawos_engineering', engineering);
                    renderAdminEngineering();
                    updateSummaryData();
                }
            }
        });
    }

    // -------------------------------------------------------------
    // 6. INTERATIVIDADE DA CALCULADORA
    // -------------------------------------------------------------

    // Troca de Abas — mantendo estado e recalculando
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            const targetEl = document.getElementById(targetId);
            if (targetEl) targetEl.classList.add('active');

            // Garante ressincronização do modelo de caixa e empresa ao trocar de aba
            if (typeof syncSelectionsUI === 'function') syncSelectionsUI();
            updateSummaryData();
        });
    });

    // Seleção de Categoria de Embalagem
    boxOptionCards.forEach(card => {
        card.addEventListener('click', () => {
            boxOptionCards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            
            const value = card.getAttribute('data-value');
            window.xpaceSelectedBoxType = value;
            if (boxTypeInput) boxTypeInput.value = value;
            localStorage.setItem('xpace_selected_boxtype', value);
            
            // Alternar grids de sub-opções
            document.querySelectorAll('.sub-options-grid').forEach(grid => {
                grid.classList.remove('active');
            });
            
            const activeGrid = document.getElementById(`sub-grid-${value}`);
            if (activeGrid) {
                activeGrid.classList.add('active');
                
                // Seleciona a primeira sub-opção desse grid automaticamente
                const firstSubCard = activeGrid.querySelector('.sub-option-card');
                if (firstSubCard) {
                    activeGrid.querySelectorAll('.sub-option-card').forEach(sc => sc.classList.remove('active'));
                    firstSubCard.classList.add('active');
                    if (boxSubtypeInput) boxSubtypeInput.value = firstSubCard.getAttribute('data-subvalue');
                    localStorage.setItem('xpace_selected_boxsubtype', firstSubCard.getAttribute('data-subvalue'));
                }
            }
            
            // Alternar diagramas explicativos na aba de dimensões
            document.querySelectorAll('.dim-diagram').forEach(diag => diag.classList.add('hidden'));
            const activeDiagram = document.getElementById(`dim-diagram-${value}`);
            if (activeDiagram) {
                activeDiagram.classList.remove('hidden');
            }
            
            updateSubOptionSelection();
        });
    });

    // Seleção de Sub-opções de Embalagem
    subOptionCards.forEach(subCard => {
        subCard.addEventListener('click', () => {
            const parentGrid = subCard.closest('.sub-options-grid');
            if (parentGrid) {
                parentGrid.querySelectorAll('.sub-option-card').forEach(sc => sc.classList.remove('active'));
            }
            subCard.classList.add('active');
            const subVal = subCard.getAttribute('data-subvalue');
            if (boxSubtypeInput) boxSubtypeInput.value = subVal;
            localStorage.setItem('xpace_selected_boxsubtype', subVal);
            
            updateSubOptionSelection();
        });
    });

    // Seleção de Empresa Vendedora
    companyOptionCards.forEach(card => {
        card.addEventListener('click', () => {
            const company = card.getAttribute('data-company');
            if (company) {
                window.xpaceSelectedCompany = company.toUpperCase();
                localStorage.setItem('xpace_selected_company', company.toUpperCase());
                if (sellingCompanyInput) sellingCompanyInput.value = company.toUpperCase();
            }
            if (typeof syncSelectionsUI === 'function') syncSelectionsUI();
            updateSummaryData();
        });
    });

    function updateSubOptionSelection() {
        const savedBox = (typeof getSelectedBoxType === 'function') ? getSelectedBoxType() : (localStorage.getItem('xpace_selected_boxtype') || 'maleta');
        const savedComp = (typeof getSelectedCompany === 'function') ? getSelectedCompany() : (localStorage.getItem('xpace_selected_company') || 'DAWOS');

        if (typeof syncSelectionsUI === 'function') syncSelectionsUI();

        let categoryName = 'Caixa Maleta';
        if (savedBox === 'acessorio' || savedBox === 'tabuleiro') categoryName = 'Tabuleiro';
        else if (savedBox === 'corte-vinco') categoryName = 'Corte & Vinco';

        if (summaryBoxText) summaryBoxText.textContent = categoryName;
        if (summaryCompanyText) summaryCompanyText.textContent = savedComp;
        const pfLabel = document.getElementById('pf-company-label');
        if (pfLabel) pfLabel.textContent = savedComp + ' Embalagens';

        updateSummaryData();
    }



    // Sincronização Slider -> Input Quantidade
    quantitySlider.addEventListener('input', (e) => {
        quantityInput.value = e.target.value;
        updateSummaryData();
    });

    // Sincronização Input -> Slider Quantidade
    quantityInput.addEventListener('input', (e) => {
        let val = parseInt(e.target.value) || 0;
        if (val < 100) val = 100;
        if (val > 100000) val = 100000;
        quantitySlider.value = val;
        updateSummaryData();
    });

    // Popula o primeiro dropdown da calculadora: Fornecedores
    function populateCalculatorDropdowns() {
        if (!materialSupplierSelect) return;
        const selectedSupplier = materialSupplierSelect.value;
        
        materialSupplierSelect.innerHTML = '<option value="" disabled selected>ESCOLHA O FORNECEDOR...</option>';
        suppliers.forEach(sup => {
            const opt = document.createElement('option');
            opt.value = sup;
            opt.textContent = sup;
            materialSupplierSelect.appendChild(opt);
        });
        
        if (suppliers.includes(selectedSupplier)) {
            materialSupplierSelect.value = selectedSupplier;
        } else {
            materialSupplierSelect.value = "";
            if (paperClassSelect) {
                paperClassSelect.innerHTML = '<option value="" disabled selected>AGUARDANDO FORNECEDOR...</option>';
                paperClassSelect.disabled = true;
            }
            if (paperTypeSelect) {
                paperTypeSelect.innerHTML = '<option value="" disabled selected>AGUARDANDO TIPO DE PAPELÃO...</option>';
                paperTypeSelect.disabled = true;
            }
        }
    }

    // Reatividade: Quando muda Fornecedor na calculadora
    if (materialSupplierSelect) {
        materialSupplierSelect.addEventListener('change', () => {
            const sup = materialSupplierSelect.value;
            if (!sup) return;

            // Filtra os tipos de papelão que esse fornecedor realmente tem cadastrados (ignorando códigos vazios)
            const availablePaperClasses = [...new Set(
                materials
                    .filter(m => m.supplier === sup && m.paperType && m.paperType.trim() !== '')
                    .map(m => m.paperType.trim())
            )];

            if (paperClassSelect) {
                paperClassSelect.innerHTML = '<option value="" disabled selected>SELECIONE O TIPO DE PAPELÃO</option>';
                availablePaperClasses.forEach(pcCode => {
                    if (!pcCode || pcCode.trim() === '') return;
                    const pc = paperClasses.find(p => p.code === pcCode);
                    const desc = (pc && pc.desc && pc.desc.trim() !== '') ? pc.desc : pcCode;
                    const opt = document.createElement('option');
                    opt.value = pcCode;
                    opt.textContent = desc;
                    paperClassSelect.appendChild(opt);
                });
                paperClassSelect.disabled = false;
            }

            if (paperTypeSelect) {
                paperTypeSelect.innerHTML = '<option value="" disabled selected>AGUARDANDO TIPO DE PAPELÃO...</option>';
                paperTypeSelect.disabled = true;
            }

            updateSummaryData();
        });
    }

    // Reatividade: Quando muda Tipo de Papelão na calculadora
    if (paperClassSelect) {
        paperClassSelect.addEventListener('change', () => {
            const sup = materialSupplierSelect.value;
            const pc = paperClassSelect.value;
            if (!sup || !pc) return;

            // Filtra os materiais cadastrados desse fornecedor E desse tipo de papelão
            const filtered = materials.filter(m => m.supplier === sup && m.paperType === pc);

            if (paperTypeSelect) {
                paperTypeSelect.innerHTML = '';
                if (filtered.length === 0) {
                    paperTypeSelect.innerHTML = '<option value="" disabled selected>NENHUM MATERIAL ESPECÍFICO CADASTRADO</option>';
                    paperTypeSelect.disabled = true;
                    hideMaterialSpecsCard();
                } else {
                    filtered.forEach((mat, idx) => {
                        const opt = document.createElement('option');
                        const costIpi = mat.costIpi !== undefined ? mat.costIpi : (mat.cost || 0);
                        opt.value = mat.code;
                        opt.textContent = `${mat.name} - (R$ ${costIpi.toFixed(2)}/M²)`;
                        if (idx === 0) opt.selected = true;
                        paperTypeSelect.appendChild(opt);
                    });
                    paperTypeSelect.disabled = false;
                    // Atualiza o card com o primeiro material selecionado automaticamente
                    updateMaterialSpecsCard();
                }
            }

            updateSummaryData();
        });
    }

    // Reatividade: Quando muda o Material Específico na calculadora
    if (paperTypeSelect) {
        paperTypeSelect.addEventListener('change', () => {
            updateMaterialSpecsCard();
            updateSummaryData();
        });
    }

    // Preenche os cards de especificações e alternativa mais barata
    function updateMaterialSpecsCard() {
        const specsCard = document.getElementById('material-specs-card');
        const altCard = document.getElementById('material-alt-card');
        if (!specsCard || !altCard || !paperTypeSelect || !paperTypeSelect.value) {
            hideMaterialSpecsCard();
            return;
        }
        const selectedCode = paperTypeSelect.value;
        const mat = materials.find(m => m.code === selectedCode);
        if (!mat) { hideMaterialSpecsCard(); return; }

        const costIpi = mat.costIpi !== undefined ? mat.costIpi : (mat.cost || 0);

        // Preenche o card de specs
        document.getElementById('spec-code').textContent = mat.code;
        document.getElementById('spec-type').textContent = mat.paperType;
        document.getElementById('spec-grammage').textContent = mat.grammage || '-';
        document.getElementById('spec-pressure').textContent = mat.pressureRes || '-';
        document.getElementById('spec-price').textContent = `R$ ${costIpi.toFixed(2)}`;
        specsCard.classList.remove('hidden');
        specsCard.style.display = 'flex';

        // Verifica alternativa mais barata (mesmo tipo de papelão, fornecedor diferente)
        const alternatives = materials.filter(m =>
            m.paperType === mat.paperType &&
            m.supplier !== mat.supplier &&
            (m.costIpi !== undefined ? m.costIpi : (m.cost || 0)) < costIpi
        );

        if (alternatives.length > 0) {
            // Pega o mais barato
            alternatives.sort((a, b) =>
                (a.costIpi !== undefined ? a.costIpi : (a.cost || 0)) -
                (b.costIpi !== undefined ? b.costIpi : (b.cost || 0))
            );
            const best = alternatives[0];
            const bestCost = best.costIpi !== undefined ? best.costIpi : (best.cost || 0);
            const saving = costIpi - bestCost;

            document.getElementById('alt-code').textContent = best.code;
            document.getElementById('alt-supplier').textContent = best.supplier;
            document.getElementById('alt-grammage').textContent = best.grammage || '-';
            document.getElementById('alt-pressure').textContent = best.pressureRes || '-';
            document.getElementById('alt-price').textContent = `R$ ${bestCost.toFixed(2)}`;
            document.getElementById('alt-saving').textContent = `R$ ${saving.toFixed(2)}`;

            altCard.classList.remove('hidden');
            altCard.style.display = 'flex';
        } else {
            altCard.classList.add('hidden');
            altCard.style.display = 'none';
        }
    }

    function hideMaterialSpecsCard() {
        const specsCard = document.getElementById('material-specs-card');
        const altCard = document.getElementById('material-alt-card');
        if (specsCard) { specsCard.classList.add('hidden'); specsCard.style.display = 'none'; }
        if (altCard) { altCard.classList.add('hidden'); altCard.style.display = 'none'; }
    }

    // Tratar envio acidental do formulário ao apertar ENTER
    if (pricingForm) {
        pricingForm.addEventListener('submit', (e) => e.preventDefault());
        pricingForm.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (e.target && e.target.blur) e.target.blur();
                updateSummaryData();
            }
        });
    }

    // Escuta alterações nos inputs físicos para recalcular a área e o preço em tempo real
    [lengthInput, widthInput, heightInput, paperTypeSelect, paperClassSelect, materialSupplierSelect, quantityInput].forEach(input => {
        if (input) {
            input.addEventListener('input', updateSummaryData);
            input.addEventListener('change', updateSummaryData);
            input.addEventListener('keyup', updateSummaryData);
            input.addEventListener('blur', updateSummaryData);
        }
    });

    // Atualiza os dados do card resumo e a área calculada
    function updateSummaryData() {
        // Empresa Vendedora
        if (summaryCompanyText) {
            summaryCompanyText.textContent = sellingCompanyInput ? sellingCompanyInput.value : 'DAWOS';
        }
        
        // Dimensões
        const length = lengthInput ? lengthInput.value || '0' : '0';
        const width = widthInput ? widthInput.value || '0' : '0';
        const height = heightInput ? heightInput.value || '0' : '0';
        if (summaryDimText) {
            summaryDimText.textContent = `${length} x ${width} x ${height} mm`;
        }
        
        // Material
        let paperSelectedText = 'Não selecionado';
        if (paperTypeSelect && paperTypeSelect.selectedIndex !== -1) {
            paperSelectedText = paperTypeSelect.options[paperTypeSelect.selectedIndex].text.split('-')[0].trim();
        }
        if (summaryMaterialText) {
            summaryMaterialText.textContent = paperSelectedText;
        }
        
        // Quantidade
        if (quantityInput && summaryQtyText) {
            const qtyFormatted = parseInt(quantityInput.value || 100).toLocaleString('pt-BR');
            summaryQtyText.textContent = `${qtyFormatted} unids`;
        }

        // Executar simulação de cálculos e atualização de área
        calculateMockPrice();
        if (typeof updatePricingFormation === 'function') {
            updatePricingFormation();
        }
        if (typeof dawosRecalcPreco === 'function') {
            dawosRecalcPreco();
        }
    }

    // Helpers de avaliação de fórmulas customizadas da Engenharia
    function getWaveFromPaperClass(code) {
        if (!code) return 'B';
        const upper = code.toUpperCase();
        if (upper.includes('-BC') || upper.includes('BC') || upper.startsWith('OD')) {
            return 'BC';
        }
        return 'B';
    }

    function evaluateFormula(formulaStr, C, L, A) {
        if (!formulaStr) return 0;
        // Substitui variáveis
        let formatted = formulaStr
            .replace(/C/gi, C)
            .replace(/L/gi, L)
            .replace(/A/gi, A);
        try {
            return Function(`"use strict"; return (${formatted})`)();
        } catch (e) {
            console.error("Erro ao avaliar fórmula da chapa:", formulaStr, e);
            return 0;
        }
    }

    // Cálculo Ilustrativo de Precificação Realista
    function calculateMockPrice() {
        let length = parseFloat(lengthInput.value) || 0;
        let width = parseFloat(widthInput.value) || 0;
        const height = parseFloat(heightInput.value) || 0;
        const quantity = parseInt(quantityInput.value) || 100;
        const boxType = (typeof getSelectedBoxType === 'function') ? getSelectedBoxType() : ((boxTypeInput && boxTypeInput.value) ? boxTypeInput.value : (localStorage.getItem('xpace_selected_boxtype') || 'maleta'));

        // Validação da Caixa Maleta: Comprimento deve ser maior ou igual a Largura
        if (boxType === 'maleta' && width > length && length > 0) {
            alert("❌ ERRO DE VALIDAÇÃO:\n\nEM UMA CAIXA MALETA, A LARGURA NUNCA PODE SER MAIOR QUE O COMPRIMENTO!");
            width = length;
            if (widthInput) widthInput.value = length; // Ajusta na tela
        }
        
        let materialCost = 3.0; // valor padrão
        if (paperTypeSelect && paperTypeSelect.value) {
            const matchedMaterial = materials.find(m => m.code === paperTypeSelect.value);
            if (matchedMaterial) {
                materialCost = matchedMaterial.costIpi !== undefined ? matchedMaterial.costIpi : (matchedMaterial.cost || 3.0);
            }
        }
        
        let areaChapa = 0;
        
        // Resolve wave type (onda simples B vs dupla BC)
        let paperClassCode = '';
        if (paperTypeSelect && paperTypeSelect.value) {
            const matchedMaterial = materials.find(m => m.code === paperTypeSelect.value);
            if (matchedMaterial) {
                paperClassCode = matchedMaterial.paperType;
            }
        }
        if (!paperClassCode && paperClassSelect && paperClassSelect.value) {
            paperClassCode = paperClassSelect.value;
        }
        const selectedWave = getWaveFromPaperClass(paperClassCode);
        
        const boxSubtype = (document.getElementById('box-subtype') || {}).value || localStorage.getItem('xpace_selected_boxsubtype') || '';

        // Busca fórmula correspondente na Engenharia (suporta sub-opções como Transpasse Total)
        const matchedEng = engineering.find(e => 
            e.category.toLowerCase() === (boxType || '').toLowerCase() && 
            e.wave.toUpperCase() === (selectedWave || '').toUpperCase() &&
            (!e.subvalue || e.subvalue.toLowerCase() === boxSubtype.toLowerCase())
        );
        
        if (matchedEng) {
            const chapaLarg = evaluateFormula(matchedEng.widthFormula, length, width, height);
            const chapaComp = evaluateFormula(matchedEng.lengthFormula, length, width, height);
            areaChapa = (chapaLarg * chapaComp) / 1000000;
        } else {
            // Fallback para fórmulas originais
            if (boxType === 'maleta') {
                const chapaComp = ((length + width) * 2 + 50);
                const chapaLarg = (width + height);
                areaChapa = (chapaComp * chapaLarg) / 1000000;
            } else if (boxType === 'corte-vinco') {
                areaChapa = ((length + 100) * (width + 100)) / 1000000;
            } else {
                areaChapa = (length * width) / 1000000; // acessório
            }
        }

        // Atualizar campos de visualização da área
        if (calculatedSheetAreaText) {
            calculatedSheetAreaText.textContent = `${areaChapa.toFixed(4).replace('.', ',')} M²`;
        }
        if (calculatedSheetAreaMmText) {
            const areaMm = Math.round(areaChapa * 1000);
            calculatedSheetAreaMmText.textContent = `${areaMm} MM²`;
        }
        
        let thicknessMultiplier = 1.0;
        let printCost = 0.0;

        let scaleFactor = 1.5;
        if (quantity >= 500) scaleFactor = 1.2;
        if (quantity >= 1000) scaleFactor = 1.0;
        if (quantity >= 2500) scaleFactor = 0.85;
        if (quantity >= 5000) scaleFactor = 0.75;
        if (quantity >= 10000) scaleFactor = 0.65;

        let baseUnitPrice = (areaChapa * materialCost * thicknessMultiplier) + printCost + 0.40;
        baseUnitPrice = baseUnitPrice * scaleFactor;
        
        if (baseUnitPrice < 0.5) baseUnitPrice = 0.5;

        const totalPrice = baseUnitPrice * quantity;

        summaryUnitPrice.textContent = baseUnitPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        summaryTotalPrice.textContent = totalPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    // Inicialização do Formulário e Banco de Dados
    populateCalculatorDropdowns();
    if (materialSupplierSelect && suppliers.includes('TROMBINI')) {
        materialSupplierSelect.value = 'TROMBINI';
        materialSupplierSelect.dispatchEvent(new Event('change'));
        if (paperClassSelect && paperClassSelect.options.length > 1) {
            paperClassSelect.selectedIndex = 1;
            paperClassSelect.dispatchEvent(new Event('change'));
        }
    }
    updateSubOptionSelection();

    // Inicialização do Lembrar-me
    fillRememberedCredentials();

    // -------------------------------------------------------------
    // 7. EVENTOS DOS BOTÕES DE AÇÃO (MOCKUP E ALERTAS)
    // -------------------------------------------------------------
    btnSubmitOrder.addEventListener('click', () => {
        alert(`🎉 ORÇAMENTO DAWOS EMBALAGENS:\n\nOLÁ, ${currentUser.name}!\nSEU RASCUNHO DE PEDIDO FOI REGISTRADO COM SUCESSO NA SIMULAÇÃO COMERCIAL.`);
    });

    btnPdfExport.addEventListener('click', () => {
        alert('📄 RELATÓRIO PDF:\n\nGERANDO ESPELHO DE ORÇAMENTO TÉCNICO FORMATADO COM AS ESPECIFICAÇÕES FÍSICAS DA CAIXA...');
    });

    btnWhatsappShare.addEventListener('click', () => {
        const length = lengthInput.value;
        const width = widthInput.value;
        const height = heightInput.value;
        const qty = quantityInput.value;
        const box = summaryBoxText.textContent;
        
        const message = encodeURIComponent(`OLÁ DAWOS EMBALAGENS! GOSTARIA DE UM ORÇAMENTO PARA:\n- MODELO: ${box}\n- DIMENSÕES: ${length}x${width}x${height} MM\n- QUANTIDADE: ${qty} UNIDADES`);
        const whatsappUrl = `https://api.whatsapp.com/send?phone=5500000000000&text=${message}`;
        
        window.open(whatsappUrl, '_blank');
    });

    // ─────────────────────────────────────────────────────────────────
    // 7. CUSTO DE PAPEL — Tabela Calculada
    // ─────────────────────────────────────────────────────────────────
    const papercostIpiInput      = document.getElementById('papercost-ipi');
    const papercostIcmsInput     = document.getElementById('papercost-icms');
    const papercostPisInput      = document.getElementById('papercost-piscofins');
    const papercostTableBody     = document.getElementById('papercost-table-body');
    const btnRecalcPapercost     = document.getElementById('btn-recalc-papercost');

    function parseGrammage(grammageStr) {
        // Ex: "0,644 kg/m²" → 0.644
        if (!grammageStr) return null;
        const match = grammageStr.replace(',', '.').match(/[\d.]+/);
        return match ? parseFloat(match[0]) : null;
    }

    function fmt(val) {
        // Formata número como moeda brasileira
        return 'R$ ' + val.toFixed(4).replace('.', ',');
    }

    function renderPaperCostTable() {
        const tbody = document.getElementById('papercost-table-body');
        if (!tbody) return;

        const ipiEl  = document.getElementById('papercost-ipi');
        const icmsEl = document.getElementById('papercost-icms');
        const pisEl  = document.getElementById('papercost-piscofins');

        const ipi  = (parseFloat(ipiEl?.value)  || 3.25) / 100;
        const icms = (parseFloat(icmsEl?.value) || 12)   / 100;
        const pis  = (parseFloat(pisEl?.value)  || 9.65) / 100;

        tbody.innerHTML = '';

        let lastSupplier = null;

        // Ordena por fornecedor para garantir agrupamento limpo
        const sortedMaterials = [...materials].sort((a, b) => (a.supplier || '').localeCompare(b.supplier || ''));

        sortedMaterials.forEach(mat => {
            const costComIpi = parseFloat(mat.costIpi !== undefined ? mat.costIpi : (mat.cost || 0)) || 0;

            // Cálculos
            const semIpi     = costComIpi * (1 - ipi);
            const noLP       = semIpi * (1 - icms);
            const pisVal     = semIpi * pis;
            const noReal     = noLP - pisVal;
            const gram       = parseGrammage(mat.grammage);
            const rsPorKg    = gram ? (semIpi / gram) : null;
            const custoSNota = costComIpi - semIpi + noLP;

            // Linha separadora de fornecedor
            if (mat.supplier !== lastSupplier) {
                const trSep = document.createElement('tr');
                trSep.innerHTML = `
                    <td colspan="9" style="
                        background: rgba(217,119,36,0.08);
                        color: var(--color-laranja-bright);
                        font-weight: 700;
                        font-size: 0.7rem;
                        text-transform: uppercase;
                        letter-spacing: 0.1em;
                        padding: 8px 12px;
                        border-top: 1px solid rgba(217,119,36,0.25);
                    ">🏭 ${mat.supplier}</td>
                `;
                tbody.appendChild(trSep);
                lastSupplier = mat.supplier;
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-family:var(--font-mono); font-size:0.75rem; color:var(--color-laranja-bright);">${mat.code}</td>
                <td style="color:var(--color-text-secondary); font-size:0.75rem;">${mat.supplier}</td>
                <td style="color:#4ade80; font-weight:600;">${fmt(costComIpi)}</td>
                <td style="color:#facc15; font-weight:600;">${fmt(semIpi)}</td>
                <td style="color:#38bdf8; font-weight:600;">${fmt(noLP)}</td>
                <td style="color:#a78bfa;">${fmt(pisVal)}</td>
                <td style="color:#fb923c; font-weight:600;">${fmt(noReal)}</td>
                <td style="color:#34d399;">${rsPorKg !== null ? fmt(rsPorKg) : '-'}</td>
                <td style="color:#f87171; font-weight:600;">${fmt(custoSNota)}</td>
            `;
            tbody.appendChild(tr);
        });

        if (tbody.children.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:var(--color-text-muted); padding:20px;">Nenhum material cadastrado com preço.</td></tr>`;
        }
    }

    // Recalcula ao clicar no botão ou mudar qualquer percentual
    if (btnRecalcPapercost) btnRecalcPapercost.addEventListener('click', renderPaperCostTable);
    if (papercostIpiInput)  papercostIpiInput.addEventListener('input',  renderPaperCostTable);
    if (papercostIcmsInput) papercostIcmsInput.addEventListener('input',  renderPaperCostTable);
    if (papercostPisInput)  papercostPisInput.addEventListener('input',   renderPaperCostTable);

    // Renderiza quando a aba Custo de Papel é aberta
    document.querySelectorAll('.admin-menu-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.getAttribute('data-admin-target') === 'admin-section-papercost') {
                renderPaperCostTable();
            }
        });
    });

    // ─────────────────────────────────────────────────────────────────
    // 8. PARÂMETROS DE PRECIFICAÇÃO — Admin + localStorage
    // ─────────────────────────────────────────────────────────────────
    const defaultPricingParams = {
        mcPadrao:   40,
        comissao:    2,
        simples:     8,
        frete:     2.27,
        outros:     1.7,
        icmsDawos:  12,
        demais:      0
    };

    function getPricingParams() {
        const stored = localStorage.getItem('dawos_pricing_params');
        if (!stored) return { ...defaultPricingParams };
        try {
            const p = JSON.parse(stored);
            const num = (v, def) => {
                const n = parseFloat(v);
                return (v !== undefined && v !== null && v !== '' && !isNaN(n)) ? n : def;
            };
            const res = {
                mcPadrao:  num(p.mcPadrao,  40),
                comissao:  num(p.comissao,   2),
                simples:   num(p.simples,    8),
                frete:     num(p.frete,   2.27),
                outros:    num(p.outros,   1.7),
                icmsDawos: num(p.icmsDawos, 12),
                demais:    num(p.demais,     0)
            };
            if (res.comissao === 0 && res.simples === 0 && res.frete === 0 && res.outros === 0 && res.icmsDawos === 0) {
                res.comissao = 2;
                res.simples = 8;
                res.frete = 2.27;
                res.outros = 1.7;
                res.icmsDawos = 12;
            }
            return res;
        } catch(e) {
            return { ...defaultPricingParams };
        }
    }

    function savePricingParams(p) {
        localStorage.setItem('dawos_pricing_params', JSON.stringify(p));
        // DIAGNÓSTICO: confirma o que foi salvo
        var verify = localStorage.getItem('dawos_pricing_params');
        alert('SALVO NO LOCALSTORAGE:\n' + verify + '\n\nSe aparecer os valores corretos, o save está OK.');
    }

    // Preenche os inputs do admin com os valores salvos
    function loadParamsIntoForm() {
        var rawStored = localStorage.getItem('dawos_pricing_params');
        console.log('[DAWOS] RAW localStorage:', rawStored);
        // Usa a função global definida no HTML (independente de inicialização)
        if (typeof dawosLoadParamsIntoForm === 'function') {
            dawosLoadParamsIntoForm();
        } else {
            const p = getPricingParams();
            const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
            set('param-mc-padrao',  p.mcPadrao);
            set('param-comissao',   p.comissao);
            set('param-simples',    p.simples);
            set('param-frete',      p.frete);
            set('param-outros',     p.outros);
            set('param-icms-dawos', p.icmsDawos);
            set('param-demais',     p.demais);
        }
    }

    // Salva ao clicar no botão
    const btnSaveParams = document.getElementById('btn-save-params');
    const paramsSavedMsg = document.getElementById('params-saved-msg');
    if (btnSaveParams) {
        btnSaveParams.addEventListener('click', () => {
            const getVal = (id) => {
                const el = document.getElementById(id);
                if (!el || el.value === '' || el.value === null) return null;
                const n = parseFloat(el.value);
                return isNaN(n) ? null : n;
            };
            const p = {
                mcPadrao:  getVal('param-mc-padrao') ?? 30,
                comissao:  getVal('param-comissao')  ?? 0,
                simples:   getVal('param-simples')   ?? 0,
                frete:     getVal('param-frete')     ?? 0,
                outros:    getVal('param-outros')    ?? 0,
                icmsDawos: getVal('param-icms-dawos') ?? 0,
                demais:    getVal('param-demais')    ?? 0
            };
            savePricingParams(p);
            if (paramsSavedMsg) {
                paramsSavedMsg.style.display = 'block';
                setTimeout(() => { paramsSavedMsg.style.display = 'none'; }, 3000);
            }
            if (window.updatePricingFormation) window.updatePricingFormation();
        });
    }

    // Carrega params e tempos quando abre a aba admin correspondente
    document.querySelectorAll('.admin-menu-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-admin-target');
            if (target === 'admin-section-params') {
                loadParamsIntoForm();
            } else if (target === 'admin-section-tempos') {
                if (typeof dawosRenderTemposAdmin === 'function') dawosRenderTemposAdmin();
            }
        });
    });

    // ─────────────────────────────────────────────────────────────────
    // 9. FORMAÇÃO DE PREÇO — Cálculo reativo na aba Ver Preço
    // ─────────────────────────────────────────────────────────────────

    // Helpers de formatação
    function fmtBRL(val) {
        if (val === null || isNaN(val)) return '—';
        return 'R$ ' + val.toFixed(2).replace('.', ',');
    }
    function fmtPct(val) {
        if (val === null || isNaN(val)) return '—';
        return val.toFixed(2).replace('.', ',') + '%';
    }

    // Calcula o Custo S/ Nota do material selecionado usando os %s do Custo de Papel
    function getCustoSNota(costIpi) {
        const ipi  = (parseFloat(papercostIpiInput?.value)  || 3.25) / 100;
        const icms = (parseFloat(papercostIcmsInput?.value)  || 12)   / 100;
        return costIpi - (costIpi * ipi) - (costIpi * icms);
    }

    function updatePricingFormation() {
        window.appUpdatePricingFormation = updatePricingFormation;
        window.updatePricingFormation = updatePricingFormation;
        if (typeof window.dawosRecalcPreco === 'function') {
            window.dawosRecalcPreco();
            return;
        }
    }

    // Expõe a função de atualização globalmente para disparos inline do HTML
    window.updatePricingFormation = updatePricingFormation;

    // Disparadores: qualquer mudança relevante → recalcula a formação de preço
    const simAInput = document.getElementById('sim-a-margem');
    const simBInput = document.getElementById('sim-b-preco');
    if (simAInput) { simAInput.addEventListener('input', updatePricingFormation); simAInput.addEventListener('change', updatePricingFormation); }
    if (simBInput) { simBInput.addEventListener('input', updatePricingFormation); simBInput.addEventListener('change', updatePricingFormation); }

    // Chama updatePricingFormation sempre que o material ou dimensões mudam
    const origUpdateSummary = updateSummaryData;
    // Monkey-patch: injeta a chamada depois do calculateMockPrice
    const origCalculateMock = calculateMockPrice;
    // Simplesmente adiciona listener na mudança de tab para Ver Preço
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.getAttribute('data-target') === 'tab-price-summary') {
                updatePricingFormation();
            }
        });
    });
    // Também dispara nos inputs que afetam o custo
    [paperTypeSelect, lengthInput, widthInput, heightInput, quantityInput].forEach(el => {
        if (el) el.addEventListener('change', updatePricingFormation);
    });

    // Init
    fillRememberedCredentials();
    setTimeout(fillRememberedCredentials, 50);
    setTimeout(fillRememberedCredentials, 300);
    setTimeout(fillRememberedCredentials, 700);
    window.addEventListener('load', fillRememberedCredentials);
    window.addEventListener('pageshow', fillRememberedCredentials);

    loadParamsIntoForm();
    renderPaperCostTable();
    updatePricingFormation();

});
