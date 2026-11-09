export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      angariacoes_vu: {
        Row: {
          angar: string | null
          ano: number | null
          cliente: string | null
          created_at: string
          dt_ang: string | null
          id: string
          kms: number | null
          mat: string | null
          model: string | null
          resp: string | null
          v_compra: number | null
          version: string | null
        }
        ComputedFields: never
        Insert: {
          angar?: string | null
          ano?: number | null
          cliente?: string | null
          created_at?: string
          dt_ang?: string | null
          id?: string
          kms?: number | null
          mat?: string | null
          model?: string | null
          resp?: string | null
          v_compra?: number | null
          version?: string | null
        }
        Update: {
          angar?: string | null
          ano?: number | null
          cliente?: string | null
          created_at?: string
          dt_ang?: string | null
          id?: string
          kms?: number | null
          mat?: string | null
          model?: string | null
          resp?: string | null
          v_compra?: number | null
          version?: string | null
        }
        Relationships: []
      }
      app_access_exceptions: {
        Row: {
          created_at: string
          email: string
          level: string
          tab: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          email: string
          level: string
          tab: string
        }
        Update: {
          created_at?: string
          email?: string
          level?: string
          tab?: string
        }
        Relationships: []
      }
      app_roles: {
        Row: {
          created_at: string
          is_admin: boolean
          name: string
          permissions: NonNullable<Json>
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          is_admin?: boolean
          name: string
          permissions?: NonNullable<Json>
          updated_at?: string
        }
        Update: {
          created_at?: string
          is_admin?: boolean
          name?: string
          permissions?: NonNullable<Json>
          updated_at?: string
        }
        Relationships: []
      }
      app_tabs_por_local: {
        Row: {
          tab: string
        }
        ComputedFields: never
        Insert: {
          tab: string
        }
        Update: {
          tab?: string
        }
        Relationships: []
      }
      app_users: {
        Row: {
          created_at: string
          email: string | null
          id: string
          local: Json | null
          marca: Json | null
          negocio: Json | null
          nome: string | null
          perfil: string | null
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          local?: Json | null
          marca?: Json | null
          negocio?: Json | null
          nome?: string | null
          perfil?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          local?: Json | null
          marca?: Json | null
          negocio?: Json | null
          nome?: string | null
          perfil?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      atividade: {
        Row: {
          created_at: string
          email: string
          id: number
          pagina: string | null
          tipo: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          email?: string
          id?: never
          pagina?: string | null
          tipo: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: never
          pagina?: string | null
          tipo?: string
        }
        Relationships: []
      }
      campanha_i3_historico: {
        Row: {
          autor: string | null
          created_at: string
          de: string | null
          id: string
          lead_id: string
          para: string | null
          tipo: string
        }
        ComputedFields: never
        Insert: {
          autor?: string | null
          created_at?: string
          de?: string | null
          id?: string
          lead_id: string
          para?: string | null
          tipo: string
        }
        Update: {
          autor?: string | null
          created_at?: string
          de?: string | null
          id?: string
          lead_id?: string
          para?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "campanha_i3_historico_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "campanha_i3_leads"
            referencedColumns: ["id"]
          }
        ]
      }
      campanha_i3_leads: {
        Row: {
          atribuido_em: string | null
          atribuido_por: string | null
          chave: string
          contacto: string | null
          created_at: string
          data_contacto: string | null
          email: string | null
          estado: string
          id: string
          importado_por: string | null
          nome: string
          observacoes: string | null
          owner_email: string | null
          owner_nome: string | null
          polo: string | null
          ponto_situacao: string | null
          proximo_contacto: string | null
          ultima_atualizacao: string | null
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          atribuido_em?: string | null
          atribuido_por?: string | null
          chave?: string
          contacto?: string | null
          created_at?: string
          data_contacto?: string | null
          email?: string | null
          estado?: string
          id?: string
          importado_por?: string | null
          nome: string
          observacoes?: string | null
          owner_email?: string | null
          owner_nome?: string | null
          polo?: string | null
          ponto_situacao?: string | null
          proximo_contacto?: string | null
          ultima_atualizacao?: string | null
          updated_at?: string
        }
        Update: {
          atribuido_em?: string | null
          atribuido_por?: string | null
          chave?: string
          contacto?: string | null
          created_at?: string
          data_contacto?: string | null
          email?: string | null
          estado?: string
          id?: string
          importado_por?: string | null
          nome?: string
          observacoes?: string | null
          owner_email?: string | null
          owner_nome?: string | null
          polo?: string | null
          ponto_situacao?: string | null
          proximo_contacto?: string | null
          ultima_atualizacao?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      car_wash_cycles: {
        Row: {
          created_at: string
          created_by: string | null
          duration_min: number
          effective_at: string | null
          ended_at: string | null
          id: string
          model: string | null
          notes: string | null
          plate: string
          quality_at: string | null
          quality_by: string | null
          quality_comment: string | null
          quality_score: number | null
          queue_order: number | null
          scheduled_at: string | null
          scheduled_by: string | null
          started_at: string | null
          updated_at: string
          wash_type: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          created_by?: string | null
          duration_min: number
          effective_at?: never
          ended_at?: string | null
          id?: string
          model?: string | null
          notes?: string | null
          plate: string
          quality_at?: string | null
          quality_by?: string | null
          quality_comment?: string | null
          quality_score?: number | null
          queue_order?: number | null
          scheduled_at?: string | null
          scheduled_by?: string | null
          started_at?: string | null
          updated_at?: string
          wash_type: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          duration_min?: number
          effective_at?: never
          ended_at?: string | null
          id?: string
          model?: string | null
          notes?: string | null
          plate?: string
          quality_at?: string | null
          quality_by?: string | null
          quality_comment?: string | null
          quality_score?: number | null
          queue_order?: number | null
          scheduled_at?: string | null
          scheduled_by?: string | null
          started_at?: string | null
          updated_at?: string
          wash_type?: string
        }
        Relationships: []
      }
      car_wash_events: {
        Row: {
          action: string
          actor: string | null
          created_at: string
          cycle_id: string | null
          detail: string | null
          id: string
          plate: string | null
          snapshot: Json | null
          wash_type: string | null
        }
        ComputedFields: never
        Insert: {
          action: string
          actor?: string | null
          created_at?: string
          cycle_id?: string | null
          detail?: string | null
          id?: string
          plate?: string | null
          snapshot?: Json | null
          wash_type?: string | null
        }
        Update: {
          action?: string
          actor?: string | null
          created_at?: string
          cycle_id?: string | null
          detail?: string | null
          id?: string
          plate?: string | null
          snapshot?: Json | null
          wash_type?: string | null
        }
        Relationships: []
      }
      cartao_go_registos: {
        Row: {
          created_at: string
          data: string
          id: string
          registado_por: string
          vendedor_email: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          data?: string
          id?: string
          registado_por?: string
          vendedor_email: string
        }
        Update: {
          created_at?: string
          data?: string
          id?: string
          registado_por?: string
          vendedor_email?: string
        }
        Relationships: []
      }
      control_records: {
        Row: {
          app: string | null
          bev: number | null
          biz: string | null
          chas: string | null
          cliente: string | null
          cme: number | null
          created_at: string | null
          csc: number | null
          date298: string | null
          dfat: string | null
          dmat: string | null
          enc: string | null
          fin: string | null
          gar: string | null
          gkl: number | null
          id: string
          id_cliente: string | null
          m: number | null
          mat: string | null
          mat_pedida_em: string | null
          mes1: string | null
          model: string | null
          mpa: number | null
          neg: string | null
          obs: string | null
          qor: number | null
          resp: string | null
          ret: number
          status: string | null
          type: string | null
          updated_at: string | null
          version: string | null
          week198: string | null
          xev: number | null
        }
        ComputedFields: never
        Insert: {
          app?: string | null
          bev?: number | null
          biz?: string | null
          chas?: string | null
          cliente?: string | null
          cme?: number | null
          created_at?: string | null
          csc?: number | null
          date298?: string | null
          dfat?: string | null
          dmat?: string | null
          enc?: string | null
          fin?: string | null
          gar?: string | null
          gkl?: number | null
          id?: string
          id_cliente?: string | null
          m?: number | null
          mat?: string | null
          mat_pedida_em?: string | null
          mes1?: string | null
          model?: string | null
          mpa?: number | null
          neg?: string | null
          obs?: string | null
          qor?: number | null
          resp?: string | null
          ret?: number
          status?: string | null
          type?: string | null
          updated_at?: string | null
          version?: string | null
          week198?: string | null
          xev?: number | null
        }
        Update: {
          app?: string | null
          bev?: number | null
          biz?: string | null
          chas?: string | null
          cliente?: string | null
          cme?: number | null
          created_at?: string | null
          csc?: number | null
          date298?: string | null
          dfat?: string | null
          dmat?: string | null
          enc?: string | null
          fin?: string | null
          gar?: string | null
          gkl?: number | null
          id?: string
          id_cliente?: string | null
          m?: number | null
          mat?: string | null
          mat_pedida_em?: string | null
          mes1?: string | null
          model?: string | null
          mpa?: number | null
          neg?: string | null
          obs?: string | null
          qor?: number | null
          resp?: string | null
          ret?: number
          status?: string | null
          type?: string | null
          updated_at?: string | null
          version?: string | null
          week198?: string | null
          xev?: number | null
        }
        Relationships: []
      }
      control_records_vu: {
        Row: {
          a360: number | null
          app: string | null
          bev: number | null
          biz: string | null
          chas: string | null
          cliente: string | null
          cme: number | null
          created_at: string | null
          csc: number | null
          date298: string | null
          dfat: string | null
          dgarant: string | null
          dmat: string | null
          dt_fecho: string | null
          enc: string | null
          fin: string | null
          gar: string | null
          garant3s: string | null
          gkl: number | null
          id: string
          id_cliente: string | null
          m: number | null
          mat: string | null
          mes1: string | null
          model: string | null
          mpa: number | null
          neg: string | null
          obs: string | null
          prov: string | null
          qor: number | null
          recond: number | null
          resp: string | null
          ret: number
          status: string | null
          type: string | null
          updated_at: string | null
          version: string | null
          week198: string | null
          xev: number | null
        }
        ComputedFields: never
        Insert: {
          a360?: number | null
          app?: string | null
          bev?: number | null
          biz?: string | null
          chas?: string | null
          cliente?: string | null
          cme?: number | null
          created_at?: string | null
          csc?: number | null
          date298?: string | null
          dfat?: string | null
          dgarant?: string | null
          dmat?: string | null
          dt_fecho?: string | null
          enc?: string | null
          fin?: string | null
          gar?: string | null
          garant3s?: string | null
          gkl?: number | null
          id?: string
          id_cliente?: string | null
          m?: number | null
          mat?: string | null
          mes1?: string | null
          model?: string | null
          mpa?: number | null
          neg?: string | null
          obs?: string | null
          prov?: string | null
          qor?: number | null
          recond?: number | null
          resp?: string | null
          ret?: number
          status?: string | null
          type?: string | null
          updated_at?: string | null
          version?: string | null
          week198?: string | null
          xev?: number | null
        }
        Update: {
          a360?: number | null
          app?: string | null
          bev?: number | null
          biz?: string | null
          chas?: string | null
          cliente?: string | null
          cme?: number | null
          created_at?: string | null
          csc?: number | null
          date298?: string | null
          dfat?: string | null
          dgarant?: string | null
          dmat?: string | null
          dt_fecho?: string | null
          enc?: string | null
          fin?: string | null
          gar?: string | null
          garant3s?: string | null
          gkl?: number | null
          id?: string
          id_cliente?: string | null
          m?: number | null
          mat?: string | null
          mes1?: string | null
          model?: string | null
          mpa?: number | null
          neg?: string | null
          obs?: string | null
          prov?: string | null
          qor?: number | null
          recond?: number | null
          resp?: string | null
          ret?: number
          status?: string | null
          type?: string | null
          updated_at?: string | null
          version?: string | null
          week198?: string | null
          xev?: number | null
        }
        Relationships: []
      }
      crm_notes: {
        Row: {
          body: string
          cliente: string | null
          control_id: string | null
          created_at: string
          created_by: string | null
          id: string
          resp: string | null
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          body: string
          cliente?: string | null
          control_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          resp?: string | null
          updated_at?: string
        }
        Update: {
          body?: string
          cliente?: string | null
          control_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          resp?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      crm_reminders: {
        Row: {
          body: string | null
          cliente: string | null
          control_id: string | null
          created_at: string
          created_by: string | null
          done: boolean
          done_at: string | null
          due_at: string | null
          id: string
          kind: string
          resp: string | null
          title: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          body?: string | null
          cliente?: string | null
          control_id?: string | null
          created_at?: string
          created_by?: string | null
          done?: boolean
          done_at?: string | null
          due_at?: string | null
          id?: string
          kind?: string
          resp?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          cliente?: string | null
          control_id?: string | null
          created_at?: string
          created_by?: string | null
          done?: boolean
          done_at?: string | null
          due_at?: string | null
          id?: string
          kind?: string
          resp?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      demo_afetacoes: {
        Row: {
          chassis: string
          created_at: string
          pessoa_id: string
        }
        ComputedFields: never
        Insert: {
          chassis: string
          created_at?: string
          pessoa_id: string
        }
        Update: {
          chassis?: string
          created_at?: string
          pessoa_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "demo_afetacoes_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "demo_pessoas"
            referencedColumns: ["id"]
          }
        ]
      }
      demo_capas: {
        Row: {
          chassis: string
          updated_at: string
          updated_by: string | null
          url: string
        }
        ComputedFields: never
        Insert: {
          chassis: string
          updated_at?: string
          updated_by?: string | null
          url: string
        }
        Update: {
          chassis?: string
          updated_at?: string
          updated_by?: string | null
          url?: string
        }
        Relationships: []
      }
      demo_emprestimos: {
        Row: {
          alocado_nome: string
          cliente_nif: string | null
          cliente_telefone: string | null
          created_at: string | null
          demo_id: string
          fim: string
          id: string
          inicio: string
          notas: string | null
          responsavel_interno: string | null
          tipo: string
          updated_at: string | null
        }
        ComputedFields: never
        Insert: {
          alocado_nome: string
          cliente_nif?: string | null
          cliente_telefone?: string | null
          created_at?: string | null
          demo_id: string
          fim: string
          id?: string
          inicio: string
          notas?: string | null
          responsavel_interno?: string | null
          tipo: string
          updated_at?: string | null
        }
        Update: {
          alocado_nome?: string
          cliente_nif?: string | null
          cliente_telefone?: string | null
          created_at?: string | null
          demo_id?: string
          fim?: string
          id?: string
          inicio?: string
          notas?: string | null
          responsavel_interno?: string | null
          tipo?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "demo_emprestimos_demo_id_fkey"
            columns: ["demo_id"]
            isOneToOne: false
            referencedRelation: "demos"
            referencedColumns: ["id"]
          }
        ]
      }
      demo_pessoas: {
        Row: {
          created_at: string
          id: string
          nome: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          id?: string
          nome: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      demos: {
        Row: {
          bev: string | null
          bsi: string | null
          chass: string | null
          created_at: string | null
          data: string | null
          dem: number | null
          dep: number | null
          dep_eur: number | null
          desc_pct: number | null
          dsc_eur: number | null
          eco: number | null
          enc: string | null
          esf: number | null
          evento: string | null
          ice: string | null
          id: string
          isv: number | null
          iva2: number | null
          leg_tr: number | null
          local: string | null
          m: string | null
          mat: string | null
          mg: number | null
          mgb: number | null
          modelo: string | null
          net: number | null
          opc: number | null
          pac: number | null
          pct: number | null
          pv_min: number | null
          pvb: number | null
          pvp: number | null
          pvp_desc: number | null
          qor: string | null
          s_iva: number | null
          sup: number | null
          t1: number | null
          t2: number | null
          updated_at: string | null
          versao: string | null
          xev: string | null
        }
        ComputedFields: never
        Insert: {
          bev?: string | null
          bsi?: string | null
          chass?: string | null
          created_at?: string | null
          data?: string | null
          dem?: number | null
          dep?: number | null
          dep_eur?: number | null
          desc_pct?: number | null
          dsc_eur?: number | null
          eco?: number | null
          enc?: string | null
          esf?: number | null
          evento?: string | null
          ice?: string | null
          id?: string
          isv?: number | null
          iva2?: number | null
          leg_tr?: number | null
          local?: string | null
          m?: string | null
          mat?: string | null
          mg?: number | null
          mgb?: number | null
          modelo?: string | null
          net?: number | null
          opc?: number | null
          pac?: number | null
          pct?: number | null
          pv_min?: number | null
          pvb?: number | null
          pvp?: number | null
          pvp_desc?: number | null
          qor?: string | null
          s_iva?: number | null
          sup?: number | null
          t1?: number | null
          t2?: number | null
          updated_at?: string | null
          versao?: string | null
          xev?: string | null
        }
        Update: {
          bev?: string | null
          bsi?: string | null
          chass?: string | null
          created_at?: string | null
          data?: string | null
          dem?: number | null
          dep?: number | null
          dep_eur?: number | null
          desc_pct?: number | null
          dsc_eur?: number | null
          eco?: number | null
          enc?: string | null
          esf?: number | null
          evento?: string | null
          ice?: string | null
          id?: string
          isv?: number | null
          iva2?: number | null
          leg_tr?: number | null
          local?: string | null
          m?: string | null
          mat?: string | null
          mg?: number | null
          mgb?: number | null
          modelo?: string | null
          net?: number | null
          opc?: number | null
          pac?: number | null
          pct?: number | null
          pv_min?: number | null
          pvb?: number | null
          pvp?: number | null
          pvp_desc?: number | null
          qor?: string | null
          s_iva?: number | null
          sup?: number | null
          t1?: number | null
          t2?: number | null
          updated_at?: string | null
          versao?: string | null
          xev?: string | null
        }
        Relationships: []
      }
      eot_activities: {
        Row: {
          autor: string | null
          contrato: string
          created_at: string
          created_by: string | null
          descricao: string | null
          done: boolean
          done_at: string | null
          due_at: string | null
          id: string
          owner_email: string | null
          tipo: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          autor?: string | null
          contrato: string
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          done?: boolean
          done_at?: string | null
          due_at?: string | null
          id?: string
          owner_email?: string | null
          tipo?: string
          updated_at?: string
        }
        Update: {
          autor?: string | null
          contrato?: string
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          done?: boolean
          done_at?: string | null
          due_at?: string | null
          id?: string
          owner_email?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "eot_activities_contrato_fkey"
            columns: ["contrato"]
            isOneToOne: false
            referencedRelation: "eot_contracts"
            referencedColumns: ["contrato"]
          }
        ]
      }
      eot_contracts: {
        Row: {
          cliente: string | null
          codigo_postal: string | null
          concessionario: string | null
          concessionario_resp: string | null
          contacto: string | null
          contrato: string
          data_fim: string | null
          despesas_finais: number | null
          fase: string
          imported_at: string
          kms_contratados: number | null
          manutencao: string | null
          manutencao_tipo: string | null
          marca: string | null
          matricula: string | null
          modelo: string | null
          morada: string | null
          obs: string | null
          owner_email: string | null
          owner_nome: string | null
          prazo: number | null
          prestacao: number | null
          resultado: string | null
          seguro: string | null
          telefone: string | null
          telemovel: string | null
          temperatura: string | null
          tipo: string | null
          updated_at: string
          valor_residual: number | null
          valor_total: number | null
          vendedor: string | null
        }
        ComputedFields: never
        Insert: {
          cliente?: string | null
          codigo_postal?: string | null
          concessionario?: string | null
          concessionario_resp?: string | null
          contacto?: string | null
          contrato: string
          data_fim?: string | null
          despesas_finais?: number | null
          fase?: string
          imported_at?: string
          kms_contratados?: number | null
          manutencao?: string | null
          manutencao_tipo?: string | null
          marca?: string | null
          matricula?: string | null
          modelo?: string | null
          morada?: string | null
          obs?: string | null
          owner_email?: string | null
          owner_nome?: string | null
          prazo?: number | null
          prestacao?: number | null
          resultado?: string | null
          seguro?: string | null
          telefone?: string | null
          telemovel?: string | null
          temperatura?: string | null
          tipo?: string | null
          updated_at?: string
          valor_residual?: number | null
          valor_total?: number | null
          vendedor?: string | null
        }
        Update: {
          cliente?: string | null
          codigo_postal?: string | null
          concessionario?: string | null
          concessionario_resp?: string | null
          contacto?: string | null
          contrato?: string
          data_fim?: string | null
          despesas_finais?: number | null
          fase?: string
          imported_at?: string
          kms_contratados?: number | null
          manutencao?: string | null
          manutencao_tipo?: string | null
          marca?: string | null
          matricula?: string | null
          modelo?: string | null
          morada?: string | null
          obs?: string | null
          owner_email?: string | null
          owner_nome?: string | null
          prazo?: number | null
          prestacao?: number | null
          resultado?: string | null
          seguro?: string | null
          telefone?: string | null
          telemovel?: string | null
          temperatura?: string | null
          tipo?: string | null
          updated_at?: string
          valor_residual?: number | null
          valor_total?: number | null
          vendedor?: string | null
        }
        Relationships: []
      }
      eot_owners: {
        Row: {
          chefe_email: string | null
          created_at: string
          email: string
          iniciais: string
          locais: string[]
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          chefe_email?: string | null
          created_at?: string
          email: string
          iniciais: string
          locais?: string[]
          updated_at?: string
        }
        Update: {
          chefe_email?: string | null
          created_at?: string
          email?: string
          iniciais?: string
          locais?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "eot_owners_chefe_email_fkey"
            columns: ["chefe_email"]
            isOneToOne: false
            referencedRelation: "eot_owners"
            referencedColumns: ["email"]
          }
        ]
      }
      eot_vendedor_map: {
        Row: {
          created_at: string
          owner_email: string
          raw_exemplo: string | null
          raw_norm: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          owner_email: string
          raw_exemplo?: string | null
          raw_norm: string
        }
        Update: {
          created_at?: string
          owner_email?: string
          raw_exemplo?: string | null
          raw_norm?: string
        }
        Relationships: [
          {
            foreignKeyName: "eot_vendedor_map_owner_email_fkey"
            columns: ["owner_email"]
            isOneToOne: false
            referencedRelation: "eot_owners"
            referencedColumns: ["email"]
          }
        ]
      }
      historico: {
        Row: {
          acao: string
          data_hora: string | null
          detalhes: Json | null
          id: number
          registo_id: string
          tabela: string
        }
        ComputedFields: never
        Insert: {
          acao: string
          data_hora?: string | null
          detalhes?: Json | null
          id?: never
          registo_id: string
          tabela: string
        }
        Update: {
          acao?: string
          data_hora?: string | null
          detalhes?: Json | null
          id?: never
          registo_id?: string
          tabela?: string
        }
        Relationships: []
      }
      infractions: {
        Row: {
          active: boolean | null
          created_at: string | null
          id: string
          name: string
          value: number
        }
        ComputedFields: never
        Insert: {
          active?: boolean | null
          created_at?: string | null
          id?: string
          name: string
          value?: number
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          id?: string
          name?: string
          value?: number
        }
        Relationships: []
      }
      instalacoes_anexos: {
        Row: {
          created_at: string
          criado_por: string | null
          id: string
          nome: string
          ocorrencia_id: string
          path: string
          tamanho: number | null
          tipo: string | null
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          criado_por?: string | null
          id?: string
          nome: string
          ocorrencia_id: string
          path: string
          tamanho?: number | null
          tipo?: string | null
        }
        Update: {
          created_at?: string
          criado_por?: string | null
          id?: string
          nome?: string
          ocorrencia_id?: string
          path?: string
          tamanho?: number | null
          tipo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "instalacoes_anexos_ocorrencia_id_fkey"
            columns: ["ocorrencia_id"]
            isOneToOne: false
            referencedRelation: "instalacoes_ocorrencias"
            referencedColumns: ["id"]
          }
        ]
      }
      instalacoes_historico: {
        Row: {
          autor: string | null
          created_at: string
          de: string | null
          id: string
          ocorrencia_id: string
          para: string | null
          tipo: string
        }
        ComputedFields: never
        Insert: {
          autor?: string | null
          created_at?: string
          de?: string | null
          id?: string
          ocorrencia_id: string
          para?: string | null
          tipo: string
        }
        Update: {
          autor?: string | null
          created_at?: string
          de?: string | null
          id?: string
          ocorrencia_id?: string
          para?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "instalacoes_historico_ocorrencia_id_fkey"
            columns: ["ocorrencia_id"]
            isOneToOne: false
            referencedRelation: "instalacoes_ocorrencias"
            referencedColumns: ["id"]
          }
        ]
      }
      instalacoes_ocorrencias: {
        Row: {
          categoria: string
          created_at: string
          criada_por: string | null
          data_ocorrencia: string
          data_reporte: string | null
          estado: string
          id: string
          interlocutor: string | null
          intervencao: string
          obs: string | null
          piso: string
          prioridade: string
          resolvida_em: string | null
          titulo: string
          updated_at: string
          x: number
          y: number
          zona: string | null
        }
        ComputedFields: never
        Insert: {
          categoria?: string
          created_at?: string
          criada_por?: string | null
          data_ocorrencia?: string
          data_reporte?: string | null
          estado?: string
          id?: string
          interlocutor?: string | null
          intervencao: string
          obs?: string | null
          piso: string
          prioridade?: string
          resolvida_em?: string | null
          titulo: string
          updated_at?: string
          x: number
          y: number
          zona?: string | null
        }
        Update: {
          categoria?: string
          created_at?: string
          criada_por?: string | null
          data_ocorrencia?: string
          data_reporte?: string | null
          estado?: string
          id?: string
          interlocutor?: string | null
          intervencao?: string
          obs?: string | null
          piso?: string
          prioridade?: string
          resolvida_em?: string | null
          titulo?: string
          updated_at?: string
          x?: number
          y?: number
          zona?: string | null
        }
        Relationships: []
      }
      marketing_anexos: {
        Row: {
          categoria: string
          created_at: string
          criado_por: string | null
          evento_id: string
          id: string
          nome: string
          path: string
          tamanho: number | null
          tipo: string | null
        }
        ComputedFields: never
        Insert: {
          categoria?: string
          created_at?: string
          criado_por?: string | null
          evento_id: string
          id?: string
          nome: string
          path: string
          tamanho?: number | null
          tipo?: string | null
        }
        Update: {
          categoria?: string
          created_at?: string
          criado_por?: string | null
          evento_id?: string
          id?: string
          nome?: string
          path?: string
          tamanho?: number | null
          tipo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_anexos_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "marketing_eventos"
            referencedColumns: ["id"]
          }
        ]
      }
      marketing_categorias: {
        Row: {
          cor: string
          created_at: string
          id: string
          nome: string
          ordem: number
        }
        ComputedFields: never
        Insert: {
          cor?: string
          created_at?: string
          id?: string
          nome: string
          ordem?: number
        }
        Update: {
          cor?: string
          created_at?: string
          id?: string
          nome?: string
          ordem?: number
        }
        Relationships: []
      }
      marketing_convidados: {
        Row: {
          contacto: string | null
          created_at: string
          criado_por: string | null
          estado: string
          evento_id: string
          id: string
          nome: string
          obs: string | null
          updated_at: string
          vendedor_email: string
          vendedor_nome: string | null
        }
        ComputedFields: never
        Insert: {
          contacto?: string | null
          created_at?: string
          criado_por?: string | null
          estado?: string
          evento_id: string
          id?: string
          nome: string
          obs?: string | null
          updated_at?: string
          vendedor_email: string
          vendedor_nome?: string | null
        }
        Update: {
          contacto?: string | null
          created_at?: string
          criado_por?: string | null
          estado?: string
          evento_id?: string
          id?: string
          nome?: string
          obs?: string | null
          updated_at?: string
          vendedor_email?: string
          vendedor_nome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_convidados_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "marketing_eventos"
            referencedColumns: ["id"]
          }
        ]
      }
      marketing_eventos: {
        Row: {
          categoria_id: string | null
          created_at: string
          criado_por: string | null
          descricao: string | null
          dress_code: string | null
          fim: string | null
          highlights: string[]
          hora: string | null
          id: string
          imagem_path: string | null
          inicio: string
          local: string
          titulo: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          categoria_id?: string | null
          created_at?: string
          criado_por?: string | null
          descricao?: string | null
          dress_code?: string | null
          fim?: string | null
          highlights?: string[]
          hora?: string | null
          id?: string
          imagem_path?: string | null
          inicio: string
          local?: string
          titulo: string
          updated_at?: string
        }
        Update: {
          categoria_id?: string | null
          created_at?: string
          criado_por?: string | null
          descricao?: string | null
          dress_code?: string | null
          fim?: string | null
          highlights?: string[]
          hora?: string | null
          id?: string
          imagem_path?: string | null
          inicio?: string
          local?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_eventos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "marketing_categorias"
            referencedColumns: ["id"]
          }
        ]
      }
      marketing_orcamentos: {
        Row: {
          evento_id: string
          previsto: number | null
          real: number | null
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          evento_id: string
          previsto?: number | null
          real?: number | null
          updated_at?: string
        }
        Update: {
          evento_id?: string
          previsto?: number | null
          real?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_orcamentos_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: true
            referencedRelation: "marketing_eventos"
            referencedColumns: ["id"]
          }
        ]
      }
      marketing_viaturas: {
        Row: {
          chassis: string | null
          created_at: string
          descricao: string
          evento_id: string
          id: string
          local: string | null
          obs: string | null
        }
        ComputedFields: never
        Insert: {
          chassis?: string | null
          created_at?: string
          descricao: string
          evento_id: string
          id?: string
          local?: string | null
          obs?: string | null
        }
        Update: {
          chassis?: string | null
          created_at?: string
          descricao?: string
          evento_id?: string
          id?: string
          local?: string | null
          obs?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_viaturas_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "marketing_eventos"
            referencedColumns: ["id"]
          }
        ]
      }
      notification_reads: {
        Row: {
          notification_id: string
          read_at: string
          user_email: string
        }
        ComputedFields: never
        Insert: {
          notification_id: string
          read_at?: string
          user_email: string
        }
        Update: {
          notification_id?: string
          read_at?: string
          user_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_reads_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          }
        ]
      }
      notifications: {
        Row: {
          audience: string
          body: string | null
          created_at: string
          created_by: string | null
          created_by_nome: string | null
          id: string
          link: string | null
          recipient_email: string | null
          title: string
        }
        ComputedFields: never
        Insert: {
          audience?: string
          body?: string | null
          created_at?: string
          created_by?: string | null
          created_by_nome?: string | null
          id?: string
          link?: string | null
          recipient_email?: string | null
          title: string
        }
        Update: {
          audience?: string
          body?: string | null
          created_at?: string
          created_by?: string | null
          created_by_nome?: string | null
          id?: string
          link?: string | null
          recipient_email?: string | null
          title?: string
        }
        Relationships: []
      }
      objetivos_orcamento: {
        Row: {
          ano: number
          created_at: string | null
          id: string
          mes: number
          orcamento: number
          tipo: string
          updated_at: string | null
        }
        ComputedFields: never
        Insert: {
          ano: number
          created_at?: string | null
          id?: string
          mes: number
          orcamento?: number
          tipo: string
          updated_at?: string | null
        }
        Update: {
          ano?: number
          created_at?: string | null
          id?: string
          mes?: number
          orcamento?: number
          tipo?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      objetivos_resp: {
        Row: {
          ano: number
          created_at: string | null
          id: string
          mes: number
          objetivo: number
          responsavel: string
          updated_at: string | null
        }
        ComputedFields: never
        Insert: {
          ano: number
          created_at?: string | null
          id?: string
          mes: number
          objetivo?: number
          responsavel: string
          updated_at?: string | null
        }
        Update: {
          ano?: number
          created_at?: string | null
          id?: string
          mes?: number
          objetivo?: number
          responsavel?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      penalties: {
        Row: {
          created_at: string | null
          cycle_id: number
          id: string
          infraction_id: string | null
          infraction_name: string
          registered_by: string | null
          resp: string
          value: number
        }
        ComputedFields: never
        Insert: {
          created_at?: string | null
          cycle_id?: number
          id?: string
          infraction_id?: string | null
          infraction_name: string
          registered_by?: string | null
          resp: string
          value: number
        }
        Update: {
          created_at?: string | null
          cycle_id?: number
          id?: string
          infraction_id?: string | null
          infraction_name?: string
          registered_by?: string | null
          resp?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "penalties_infraction_id_fkey"
            columns: ["infraction_id"]
            isOneToOne: false
            referencedRelation: "infractions"
            referencedColumns: ["id"]
          }
        ]
      }
      penalty_cycles: {
        Row: {
          ended_at: string | null
          id: number
          notes: string | null
          started_at: string | null
        }
        ComputedFields: never
        Insert: {
          ended_at?: string | null
          id: number
          notes?: string | null
          started_at?: string | null
        }
        Update: {
          ended_at?: string | null
          id?: number
          notes?: string | null
          started_at?: string | null
        }
        Relationships: []
      }
      platform_admins: {
        Row: {
          created_at: string
          email: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          email: string
        }
        Update: {
          created_at?: string
          email?: string
        }
        Relationships: []
      }
      prospec_accounts: {
        Row: {
          created_at: string
          created_by: string | null
          dimensao_frota: number | null
          fase: string
          fonte: string | null
          id: string
          nome: string
          owner_email: string | null
          owner_nome: string | null
          potencial: number | null
          relacao: number | null
          score: number | null
          setor: string | null
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          created_by?: string | null
          dimensao_frota?: number | null
          fase?: string
          fonte?: string | null
          id?: string
          nome: string
          owner_email?: string | null
          owner_nome?: string | null
          potencial?: number | null
          relacao?: number | null
          score?: never
          setor?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dimensao_frota?: number | null
          fase?: string
          fonte?: string | null
          id?: string
          nome?: string
          owner_email?: string | null
          owner_nome?: string | null
          potencial?: number | null
          relacao?: number | null
          score?: never
          setor?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      prospec_contacts: {
        Row: {
          account_id: string
          cargo: string | null
          created_at: string
          email: string | null
          fonte: string | null
          id: string
          nome: string
          telefone: string | null
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          account_id: string
          cargo?: string | null
          created_at?: string
          email?: string | null
          fonte?: string | null
          id?: string
          nome: string
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          cargo?: string | null
          created_at?: string
          email?: string | null
          fonte?: string | null
          id?: string
          nome?: string
          telefone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prospec_contacts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "prospec_accounts"
            referencedColumns: ["id"]
          }
        ]
      }
      prospec_interactions: {
        Row: {
          account_id: string
          autor: string | null
          created_at: string
          id: string
          nota: string | null
          occurred_at: string
          tipo: string
        }
        ComputedFields: never
        Insert: {
          account_id: string
          autor?: string | null
          created_at?: string
          id?: string
          nota?: string | null
          occurred_at?: string
          tipo?: string
        }
        Update: {
          account_id?: string
          autor?: string | null
          created_at?: string
          id?: string
          nota?: string | null
          occurred_at?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "prospec_interactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "prospec_accounts"
            referencedColumns: ["id"]
          }
        ]
      }
      prospec_push_sent: {
        Row: {
          day_key: string
          ref: string
          sent_at: string
          user_email: string
        }
        ComputedFields: never
        Insert: {
          day_key: string
          ref: string
          sent_at?: string
          user_email: string
        }
        Update: {
          day_key?: string
          ref?: string
          sent_at?: string
          user_email?: string
        }
        Relationships: []
      }
      prospec_push_subs: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          fail_count: number
          last_ok: string | null
          p256dh: string
          ua: string | null
          user_email: string | null
        }
        ComputedFields: never
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          fail_count?: number
          last_ok?: string | null
          p256dh: string
          ua?: string | null
          user_email?: string | null
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          fail_count?: number
          last_ok?: string | null
          p256dh?: string
          ua?: string | null
          user_email?: string | null
        }
        Relationships: []
      }
      prospec_tasks: {
        Row: {
          account_id: string | null
          created_at: string
          created_by: string | null
          descricao: string
          done: boolean
          done_at: string | null
          due_at: string | null
          id: string
          owner_email: string | null
          owner_nome: string | null
          type: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          account_id?: string | null
          created_at?: string
          created_by?: string | null
          descricao: string
          done?: boolean
          done_at?: string | null
          due_at?: string | null
          id?: string
          owner_email?: string | null
          owner_nome?: string | null
          type?: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          created_at?: string
          created_by?: string | null
          descricao?: string
          done?: boolean
          done_at?: string | null
          due_at?: string | null
          id?: string
          owner_email?: string | null
          owner_nome?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prospec_tasks_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "prospec_accounts"
            referencedColumns: ["id"]
          }
        ]
      }
      quality_scores: {
        Row: {
          assiduidade: number
          atendimento: number
          atitude: number
          contratos: number
          equipa: number
          month: number
          nps100: number
          retails: number
          updated_at: string
          updated_by: string | null
          vendedor: string
          year: number
        }
        ComputedFields: never
        Insert: {
          assiduidade?: number
          atendimento?: number
          atitude?: number
          contratos?: number
          equipa?: number
          month: number
          nps100?: number
          retails?: number
          updated_at?: string
          updated_by?: string | null
          vendedor?: string
          year: number
        }
        Update: {
          assiduidade?: number
          atendimento?: number
          atitude?: number
          contratos?: number
          equipa?: number
          month?: number
          nps100?: number
          retails?: number
          updated_at?: string
          updated_by?: string | null
          vendedor?: string
          year?: number
        }
        Relationships: []
      }
      retomas: {
        Row: {
          arquivada: boolean
          arquivada_at: string | null
          created_at: string
          created_by: string | null
          data_entrada_stock: string
          data_matricula: string | null
          id: string
          importado: boolean
          link_caetano: string | null
          link_fotos: string | null
          link_maxterauto: string | null
          marca: string
          matricula: string | null
          modelo: string
          motorizacao: string | null
          observacoes: string | null
          preco: number | null
          quilometragem: number | null
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          arquivada?: boolean
          arquivada_at?: string | null
          created_at?: string
          created_by?: string | null
          data_entrada_stock?: string
          data_matricula?: string | null
          id?: string
          importado?: boolean
          link_caetano?: string | null
          link_fotos?: string | null
          link_maxterauto?: string | null
          marca: string
          matricula?: string | null
          modelo: string
          motorizacao?: string | null
          observacoes?: string | null
          preco?: number | null
          quilometragem?: number | null
          updated_at?: string
        }
        Update: {
          arquivada?: boolean
          arquivada_at?: string | null
          created_at?: string
          created_by?: string | null
          data_entrada_stock?: string
          data_matricula?: string | null
          id?: string
          importado?: boolean
          link_caetano?: string | null
          link_fotos?: string | null
          link_maxterauto?: string | null
          marca?: string
          matricula?: string | null
          modelo?: string
          motorizacao?: string | null
          observacoes?: string | null
          preco?: number | null
          quilometragem?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      sugestoes: {
        Row: {
          autor_email: string
          autor_nome: string | null
          created_at: string
          descricao: string | null
          estado: string
          id: string
          pagina: string | null
          resposta: string | null
          tipo: string
          titulo: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          autor_email?: string
          autor_nome?: string | null
          created_at?: string
          descricao?: string | null
          estado?: string
          id?: string
          pagina?: string | null
          resposta?: string | null
          tipo?: string
          titulo: string
          updated_at?: string
        }
        Update: {
          autor_email?: string
          autor_nome?: string | null
          created_at?: string
          descricao?: string | null
          estado?: string
          id?: string
          pagina?: string | null
          resposta?: string | null
          tipo?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: []
      }
      utilizadores: {
        Row: {
          email: string | null
          id: number
          local: Json | null
          marca: Json | null
          negocio: Json | null
          nome: string | null
          password: string | null
          perfil: string | null
        }
        ComputedFields: never
        Insert: {
          email?: string | null
          id?: number
          local?: Json | null
          marca?: Json | null
          negocio?: Json | null
          nome?: string | null
          password?: string | null
          perfil?: string | null
        }
        Update: {
          email?: string | null
          id?: number
          local?: Json | null
          marca?: Json | null
          negocio?: Json | null
          nome?: string | null
          password?: string | null
          perfil?: string | null
        }
        Relationships: []
      }
      viaturas: {
        Row: {
          chassis: string
          data_matricula: string | null
          encomenda: string | null
          estado_entrega: string | null
          estado_negocio: string | null
          inputs: Json | null
          iva_dedutivel: boolean
          kms: number | null
          link_fotos: string | null
          local: Json | null
          marca: string | null
          matricula: string | null
          modelo: string | null
          observacoes: string | null
          reserva_expira: string | null
          reserva_user: string | null
          stats: Json | null
          tipologia: Json | null
          versao: string | null
        }
        ComputedFields: never
        Insert: {
          chassis: string
          data_matricula?: string | null
          encomenda?: string | null
          estado_entrega?: string | null
          estado_negocio?: string | null
          inputs?: Json | null
          iva_dedutivel?: boolean
          kms?: number | null
          link_fotos?: string | null
          local?: Json | null
          marca?: string | null
          matricula?: string | null
          modelo?: string | null
          observacoes?: string | null
          reserva_expira?: string | null
          reserva_user?: string | null
          stats?: Json | null
          tipologia?: Json | null
          versao?: string | null
        }
        Update: {
          chassis?: string
          data_matricula?: string | null
          encomenda?: string | null
          estado_entrega?: string | null
          estado_negocio?: string | null
          inputs?: Json | null
          iva_dedutivel?: boolean
          kms?: number | null
          link_fotos?: string | null
          local?: Json | null
          marca?: string | null
          matricula?: string | null
          modelo?: string | null
          observacoes?: string | null
          reserva_expira?: string | null
          reserva_user?: string | null
          stats?: Json | null
          tipologia?: Json | null
          versao?: string | null
        }
        Relationships: []
      }
      vu_objetivos: {
        Row: {
          bmw: number
          faturas: number
          mes: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          bmw?: number
          faturas?: number
          mes: string
          updated_at?: string
        }
        Update: {
          bmw?: number
          faturas?: number
          mes?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      access_rank: { Args: { p_tab: string }; Returns: number }
      admin_atividade_resumo: {
        Args: { p_dias?: number }
        Returns: {
          email: string
          nome: string
          pagina_top: string
          paginas: number
          perfil: string
          sessoes: number
          ultima_atividade: string
          ultimo_login: string
        }[]
      }
      app_capabilities: { Args: Record<PropertyKey, never>; Returns: Json }
      can_write_excel_file: { Args: { p_name: string }; Returns: boolean }
      demos_gravar_precos: { Args: { p_chassis: string; p_inputs: Json }; Returns: Json }
      demos_criar_viatura: { Args: { p: Json }; Returns: Json }
      demos_arquivar_viatura: { Args: { p_chassis: string }; Returns: number }
      demos_repor_viatura: { Args: { p_id: number }; Returns: string }
      demos_vendidas: { Args: Record<PropertyKey, never>; Returns: Record<string, Json>[] }
      demos_viaturas: {
        Args: Record<PropertyKey, never>
        Returns: {
          chassis: string
          data_matricula: string | null
          encomenda: string | null
          estado_entrega: string | null
          estado_negocio: string | null
          inputs: Json | null
          iva_dedutivel: boolean
          kms: number | null
          link_fotos: string | null
          local: Json | null
          marca: string | null
          matricula: string | null
          modelo: string | null
          observacoes: string | null
          reserva_expira: string | null
          reserva_user: string | null
          stats: Json | null
          tipologia: Json | null
          versao: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "viaturas"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      eot_conta_bloqueada: { Args: Record<PropertyKey, never>; Returns: boolean }
      eot_contract_link: { Args: { p_contrato: string }; Returns: string }
      eot_my_team: { Args: Record<PropertyKey, never>; Returns: string[] }
      has_access: { Args: { p_level?: string; p_tab: string }; Returns: boolean }
      has_any_access: { Args: { p_level?: string; p_tabs: string[] }; Returns: boolean }
      has_any_tab: { Args: Record<PropertyKey, never>; Returns: boolean }
      import_control_excel: {
        Args: { p_control: Json; p_orcamento?: Json; p_resp?: Json }
        Returns: number
      }
      is_app_admin: { Args: Record<PropertyKey, never>; Returns: boolean }
      is_platform_admin: { Args: Record<PropertyKey, never>; Returns: boolean }
      is_platform_user: { Args: Record<PropertyKey, never>; Returns: boolean }
      is_salesforce_user: { Args: Record<PropertyKey, never>; Returns: boolean }
      local_restrito: { Args: Record<PropertyKey, never>; Returns: boolean }
      marketing_acesso: { Args: { p_level?: string }; Returns: boolean }
      marketing_local_ok: { Args: Record<PropertyKey, never>; Returns: boolean }
      marketing_parque: {
        Args: Record<PropertyKey, never>
        Returns: {
          chassis: string
          local: Json
          marca: string
          matricula: string
          modelo: string
          versao: string
        }[]
      }
      my_access_exceptions: { Args: Record<PropertyKey, never>; Returns: Json }
      replace_rows: {
        Args: { p_allow_empty?: boolean; p_rows: Json; p_table: string }
        Returns: number
      }
      sf_perfil_insercao: { Args: Record<PropertyKey, never>; Returns: Json }
      tabs_por_local: { Args: Record<PropertyKey, never>; Returns: string[] }
      url_encode: { Args: { p_text: string }; Returns: string }
      viatura_do_meu_local: { Args: { p_chassis: string }; Returns: boolean }
      viatura_do_meu_local_pasta: { Args: { p_pasta: string }; Returns: boolean }
      viatura_local_visivel: { Args: { p_local: Json }; Returns: boolean }
      viaturas_local_ok: { Args: { p_local: Json }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {}
  }
} as const
